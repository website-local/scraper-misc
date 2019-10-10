const {Resource, HtmlResource, CssResource} = require('./link');
const processCss = require('./process-css');
const Queue = require('p-queue');
const process = require('./process');
const defaultOptions = require('./options');
const log4js = require('log4js');
const logger = {
  notFound: log4js.getLogger('404-not-found'),
  complete: log4js.getLogger('complete'),
  error: log4js.getLogger('error')
};


class Downloader {
  constructor(options) {
    const headers = options && options.req && options.req.headers;
    options = Object.assign({}, defaultOptions, options);
    if (headers) {
      Object.assign(options.req.headers, defaultOptions.req.headers, headers);
    }
    this.options = options;
    /**
     * @type Queue
     */
    this.queue = new Queue.default(options);
    this.queuedLinks = {};
    this.downloadedLinks = {};
    this.failedLinks = {};
    if (options.beginUrl && options.localRoot) {
      if (Array.isArray(options.beginUrl)) {
        for (let i = 0; i < options.beginUrl.length; i++) {
          this.add(new HtmlResource(
            options.beginUrl[i], options.localRoot, options.beginUrl[i], options));
        }
      } else {
        this.add(new HtmlResource(
          options.beginUrl, options.localRoot, options.beginUrl, options));
      }
    }
  }

  add(resource) {
    if (!(resource instanceof Resource)) {
      return false;
    }
    const url = resource._downloadLink;
    if (this.queuedLinks[url]) {
      return true;
    }
    if (resource.depth > resource.options.depth) {
      return false;
    }
    const self = this;
    if (resource instanceof HtmlResource) {
      this.queue.add(() => new Promise((resolve) => setImmediate(async () => {
        try {
          const {htmlArr, resArr} = await process(resource);
          if (resource.redirectedUrl) {
            self.queuedLinks[resource.redirectedUrl] = 1;
          }
          for (const res of resArr) {
            self.add(res);
          }
          for (const html of htmlArr) {
            self.add(html);
          }
          await resource.save();
          logger.complete.info(url, resource.depth, resource.waitTime, resource.downloadTime);
          self.downloadedLinks[url] = 1;
          if (resource.redirectedUrl) {
            self.downloadedLinks[resource.redirectedUrl] = 1;
          }
          resource = null;
          resolve();
        } catch (e) {
          self.handleError(e, url, resource);
          resolve(e);
        }
      })));
    } else {
      this.queue.add(async () => {
        try {
          if (resource instanceof CssResource) {
            const resArr = await processCss(resource);
            for (const res of resArr) {
              self.add(res);
            }
          }
          await resource.save();
          logger.complete.info(url, resource.depth, resource.waitTime, resource.downloadTime);
          self.downloadedLinks[url] = 1;
          if (resource.redirectedUrl) {
            self.queuedLinks[resource.redirectedUrl] = 1;
            self.downloadedLinks[resource.redirectedUrl] = 1;
          }
          resource = null;
        } catch (e) {
          self.handleError(e, url, resource);
        }
      });
    }

    this.queuedLinks[url] = 1;
    return true;
  }

  handleError(error, url, resource) {
    if (error && typeof this.options.onError === 'function') {
      this.options.onError(this, error, url, resource);
    }
    // try to save failed resource
    if (((resource instanceof HtmlResource) &&
      resource.doc && !resource.saved && !resource.saving) ||
      (resource && resource.body && !resource.saved && !resource.saving)) {
      resource.save().catch((err) =>
        logger.error.error('save resource fail', resource.url, err));
    }
    this.failedLinks[url] = 1;
    if (error && error.name === 'HTTPError' && error.statusCode === 404) {
      logger.notFound.error(url, resource.refUrl);
    } else {
      logger.error.error(error, url, resource);
    }
  }

  start() {
    this.finished = 0;
    if (this.adjustConcurrencyTimer) {
      clearInterval(this.adjustConcurrencyTimer);
    }
    if (this.options.adjustConcurrencyPeriod > 0) {
      this.adjustConcurrencyTimer = setInterval(() => {
        this.options.adjustConcurrencyFunc(this);
      }, this.options.adjustConcurrencyPeriod);
    }
    this.queue.onIdle().then(() => {
      this.finished = 1;
      if (typeof this.options.onSuccess === 'function') {
        this.options.onSuccess(this, this.finished);
      }
    });
    return this.queue.start();
  }

  stop() {
    if (this.adjustConcurrencyTimer) {
      clearInterval(this.adjustConcurrencyTimer);
    }
    this.queue.pause();
  }
}

module.exports = Downloader;