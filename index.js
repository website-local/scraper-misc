const fs = require('fs');
const path = require('path');
const log4js = require('log4js');
const errorLogger = log4js.getLogger('error');

const {cookieJar, mkdir} = require('./link');
const Downloader = require('./downloader');
const {preProcessHtml, postProcessHtml} = require('./mdn-process-html');
const configureLogger = require('./logger-config');
const {
  localesMap,
  localeArr,
  redirectLocale,
  defaultBeginUrl,
  skipProcessFunc,
  preProcessResource,
  detectLinkType,
  requestRedirectFunc,
  shouldDropResource,
  redirectLinkBeforeResourceInit,
  redirectUrlAfterFetch
} = require('./mdn-process-url');

/**
 *
 * @param localRoot
 * @param locale
 * @param {Partial<Options>} options
 * @return {Downloader}
 */
const downloadMdn = (localRoot, locale = 'zh-CN', options = {}) => {
  if (!localesMap[locale]) {
    throw new TypeError('locale not exists');
  }
  configureLogger(localRoot);
  const testLocaleRegExp =
    new RegExp(`/(${localeArr.filter(l => l !== locale).join('|')})\\//`, 'i');

  const localeLowerCase = locale.toLocaleLowerCase();

  const dropResourceFunc = (res) =>
    shouldDropResource(res, testLocaleRegExp, locale);

  const redirectFilterFunc = (url, res) =>
    redirectUrlAfterFetch(url, res, locale);

  const linkRedirectFunc = (url, elem, html) =>
    redirectLinkBeforeResourceInit(url, locale, html, localeLowerCase);

  if (!options.req) {
    options.req = {};
  }
  if (!options.req.hooks) {
    options.req.hooks = {};
  }
  if (!options.req.hooks.beforeRedirect) {
    options.req.hooks.beforeRedirect = [];
  }
  if (!options.req.headers) {
    options.req.headers = {};
  }
  if (!options.req.headers['accept-language']) {
    options.req.headers['accept-language'] = locale;
  }

  options.req.hooks.beforeRedirect.push(function (options) {
    const {pathname} = options.url, pathArr = pathname.split('/');
    if (pathArr && redirectLocale[pathArr[1]]) {
      pathArr[1] = locale;
      options.url.pathname = pathArr.join('/');
    }
    options.url.search = '';
  });

  const d = new Downloader(Object.assign({
    depth: 8,
    localRoot,
    beginUrl: defaultBeginUrl(locale),
    detectLinkType,
    redirectFilterFunc,
    dropResourceFunc,
    preProcessHtml,
    postProcessHtml,
    linkRedirectFunc,
    skipProcessFunc,
    requestRedirectFunc,
    preProcessResource
  }, options));

  cookieJar.setCookie(
    'django_language=' + locale,
    'https://developer.mozilla.org',
    () => {
      let basePath = path.join(localRoot, 'developer.mozilla.org', 'static', 'build'),
        jsPath = path.join(basePath, 'js'),
        cssPath = path.join(basePath, 'styles');
      mkdir(jsPath);
      mkdir(cssPath);
      fs.copyFileSync(path.join(__dirname, 'inject', 'inject.js'),
        path.join(jsPath, 'inject.js'));
      fs.copyFileSync(path.join(__dirname, 'inject', 'inject.css'),
        path.join(cssPath, 'inject.css'));
      d.start();
      d.queue.onIdle().then(() => {
        errorLogger.info('possibly finished.');
      });
    });

  return d;
};

module.exports = downloadMdn;
