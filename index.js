const fs = require('fs');
const path = require('path');
const log4js = require('log4js');
const errorLogger = log4js.getLogger('error');

const {cookieJar, mkdir} = require('./lib/link');
const Downloader = require('./lib/downloader');

// hard coded redirect url map to avoid the max-redirect things
const hardCodedRedirectUrl = require('./redirect-url');

const {preProcessHtml, postProcessHtml} = require('./mdn-process-html');
const configureLogger = require('./lib/logger-config');
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

const setCookie = (cookie, url) =>
  new Promise(r => cookieJar.setCookie(cookie, url, r));

/**
 *
 * @param localRoot
 * @param locale
 * @param {Partial<Options>} options
 * @return {Promise<Downloader>}
 */
const downloadMdn = async (localRoot, locale = 'zh-CN', options = {}) => {
  if (!localesMap[locale] && locale !== 'en-US') {
    throw new TypeError('locale not exists');
  }
  configureLogger(localRoot, 'developer.mozilla.org');
  const testLocaleRegExp =
    new RegExp(`/(${localeArr.filter(l => l !== locale).join('|')})\\//`, 'i');

  const localeLowerCase = locale.toLocaleLowerCase();

  const redirectUrlMap = hardCodedRedirectUrl(locale);

  const dropResourceFunc = (res) =>
    shouldDropResource(res, testLocaleRegExp, locale);

  const redirectFilterFunc = (url, res) =>
    redirectUrlAfterFetch(url, res, locale);

  const linkRedirectFunc = (url, elem, html) =>
    redirectLinkBeforeResourceInit(url, locale, html, localeLowerCase, redirectUrlMap);

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

  await setCookie('django_language=' + locale,
    'https://developer.mozilla.org');

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
  errorLogger.info('started');
  d.queue.onIdle().then(() => {
    errorLogger.info('possibly finished.');
  });

  return d;
};

module.exports = downloadMdn;
