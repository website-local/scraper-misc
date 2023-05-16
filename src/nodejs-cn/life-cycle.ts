import {join} from 'path';
import URI from 'urijs';
import type {Resource} from 'website-scrap-engine/lib/resource';
import {ResourceType} from 'website-scrap-engine/lib/resource';
import {error as errorLogger} from 'website-scrap-engine/lib/logger/logger';
import type {
  DownloadResource,
  ProcessingLifeCycle,
  ProcessResourceAfterDownloadFunc,
  ProcessResourceBeforeDownloadFunc,
  SubmitResourceFunc
} from 'website-scrap-engine/lib/life-cycle/types';
import {defaultLifeCycle} from 'website-scrap-engine/lib/life-cycle';
import {
  parseHtml,
  preProcess,
  processHtml,
  skipProcess
} from 'website-scrap-engine/lib/life-cycle/adapters';
import {
  defaultDownloadOptions,
  DownloadOptions,
  StaticDownloadOptions
} from 'website-scrap-engine/lib/options';
import type {Cheerio, CheerioStatic} from 'website-scrap-engine/lib/types';
import type {
  PipelineExecutor
} from 'website-scrap-engine/lib/life-cycle/pipeline-executor';
import type {DownloaderWithMeta} from 'website-scrap-engine/lib/downloader/types';
import {decryptContent, decryptLinks} from './decrypt-contents';
import {
  cache,
  cachedGetRedirectLocation,
  hardCodedRedirect,
  hardCodedRedirectFullPath,
  initNodeApiPath
} from './fix-link';

const HOST = 'nodejs.cn',
  PROTOCOL = 'https',
  URL_PREFIX = `${PROTOCOL}://${HOST}`;

const defaultApiPath = 'dist/latest-v20.x/docs/api';

const linkRedirectFunc = async (
  link: string,
  elem: Cheerio | null,
  parent: Resource | null,
  options: StaticDownloadOptions
) => {
  if (!parent) {
    return link;
  }
  if (link && (link.startsWith('/s/') ||
    link.startsWith('http://url.nodejs.cn/') ||
    link.startsWith('https://url.nodejs.cn/'))) {
    // workaround for broken links to source code on github
    // since v14.16.1, 2021-04-22
    if (elem) {
      const text = elem.text();
      if (text?.startsWith('lib/') && text.endsWith('.js') &&
        elem.prev().is('strong') &&
        elem.prev().text()?.includes('源代码')) {
        let header = elem.parents('.interior')
          .find('header>h1');
        if (!header?.length) {
          // since 16.4.1
          header = elem.parents('.interior')
            .find('header>.header-container>h1');
        }
        const regExp = /v\d{2,}\.\d+\.\d+/;
        const match = header?.text()?.match(regExp);
        const version = match?.[0];
        if (version) {
          return cache[link] =
            `https://github.com/nodejs/node/blob/${version}/${text}`;
        }
      }
    }
    if (cache[link]) {
      link = cache[link];
    } else {
      try {
        link = await cachedGetRedirectLocation(link, options);
      } catch (e) {
        // log the error and pass on since links can be broken
        errorLogger.warn(
          'Broken redirected link', link,
          'with text', elem?.text(), 'from', parent?.rawUrl);
        return;
      }
    }
  }
  const redirectLink = hardCodedRedirectFullPath[link];
  if (redirectLink) {
    link = redirectLink;
  }
  let api = defaultApiPath;
  if (options?.meta?.nodeApiPath) {
    api = options.meta.nodeApiPath as string;
    if (link[0] === '/') {
      link = link.replace(/^\/api\//, `/${api}/`);
    } else {
      link = link.replace(/^https?:\/\/nodejs.cn\/api\//,
        `https://nodejs.cn/${api}/`);
    }
  }
  let u = URI(link);
  if (u.is('relative')) {
    u = u.absoluteTo(parent.url).normalizePath();
  }
  const pathArr = u.path().split('/');
  if (pathArr.length === 3 && pathArr[1] === api && pathArr[2].endsWith('.md')) {
    pathArr[2] = pathArr[2].replace(/\.md$/i, '.html');
    u.path(pathArr.join('/'));
    link = u.toString();
  }
  const redirect = hardCodedRedirect;
  if (redirect[u.path()]) {
    u = u.path(redirect[u.path()]);
    link = u.toString();
  }
  return link;
};

const dropResource: ProcessResourceBeforeDownloadFunc = (
  res,
  element,
  parent,
  options
): Resource => {
  const api = options?.meta?.nodeApiPath || defaultApiPath;
  const shouldDrop = !(res.uri?.host() === HOST &&
      res.uri.path().startsWith(`/${api}`)) ||
    res.uri.path() === `/${api}/static/inject.css` ||
    res.uri.path() === `/${api}/static/favicon.png` ||
    res.uri.path() === `/${api}/static/inject.js`;
  if (shouldDrop) {
    res.shouldBeDiscardedFromDownload = true;
  }
  return res;
};

const preProcessResource = (
  link: string, elem: Cheerio | null, res: Resource | null
) => {
  if (!res) {
    return;
  }
  const uri = URI(link);
  if (uri.host() && uri.host() !== HOST) {
    res.replacePath = uri.toString();
    res.replaceUri = uri;
  }
  if (res.replacePath.toString().startsWith('/#')) {
    // redirected hash links
    res.replaceUri = URI(res.replacePath.toString().slice(1));
    res.replacePath = res.replaceUri.toString();
  }
  // fix redirected link
  if (!res.replaceUri?.host() && elem?.is('a') && elem.attr('target') === '_blank') {
    elem.removeAttr('target');
    elem.removeAttr('rel');
  }
};

const preProcessHtml: ProcessResourceAfterDownloadFunc = async (
  res: DownloadResource,
  submit: SubmitResourceFunc,
  options: StaticDownloadOptions
): Promise<DownloadResource> => {
  if (res.type !== ResourceType.Html) {
    return res;
  }
  if (!res.meta.doc) {
    res.meta.doc = parseHtml(res, options);
  }
  const $ = res.meta.doc;
  const head = $('head'),
    body = $('body');
  // remove comments in body
  body.contents().filter(function (this) {
    return this.nodeType === 8;
  }).remove();

  const url = (res.uri ?? URI(res.url)).clone().hash('').toString();
  // decrypt the stuffs behind login wall
  await decryptContent($, url, options);
  decryptLinks($, url);

  $('#biz_nav').remove();
  $('#biz_content').remove();
  $('#biz_item').remove();
  // login stuff
  $('#btn_login,#btn_logout,#wxcode_box').remove();
  $('#wxpaycode_box').remove();
  // remove all scripts
  $('script').remove();
  $('.wwads-cn,.wwads-horizontal').remove();
  $('a[href="/"]').remove();
  $('a[href*="aliyun.com"]').remove();
  $('a[href="/search"]').addClass('link-to-search');
  $('a[href="http://api.nodejs.cn/"]').addClass('link-to-search');
  $('a[href^="http://api.nodejs.cn/"]').addClass('link-to-search');
  $('a[href="https://api.nodejs.cn/"]').addClass('link-to-search');
  $('a[href^="https://api.nodejs.cn/"]').addClass('link-to-search');
  $('a[href^="/run/"]').addClass('link-to-run');
  // style sheet, not needed since we re-implemented it
  $('link[rel="stylesheet"]').remove();
  const api = options?.meta?.nodeApiPath as string | void || defaultApiPath;
  // style for page and prism.js
  // language=HTML
  $(`
    <link href="${URL_PREFIX}/${api}/static/inject.css" rel="stylesheet">`)
    .appendTo(head);
  // better code highlighting with prism.js
  // language=HTML
  $(`
    <script src="${URL_PREFIX}/${api}/static/inject.js" defer></script>`)
    .appendTo(body);
  // replace favicon
  $('link[rel="icon"]').remove();
  // 查看其他版本 ▼
  $('li.version-picker').remove();
  $('<link rel="icon" sizes="32x32" type="image/png" ' +
    `href="${URL_PREFIX}/${api}/static/favicon.png">`).appendTo(head);

  if (api && api !== defaultApiPath && options?.meta?.replaceNodeApiPath) {
    const el = $('#alt-docs').parent().parent();
    if (el.is('li.picker-header')) {
      el.remove();
    }
  }
  return res;
};

const postProcessHtml = ($: CheerioStatic) => {
  const array = $('a[href]');
  for (let i = 0, a, attr, href; i < array.length; i++) {
    if ((a = array[i]) &&
      a.type === 'tag' &&
      (attr = a.attribs) &&
      (href = attr.href) &&
      (href = cache[href])) {
      a.attribs.href = href;
    }
  }

  $('a[href^="https://github.com/nodejscn/node-api-cn/edit/"]')
    .addClass('link-to-edit');
  return $;
};

const postProcessSavePath = (
  res: DownloadResource,
  submit: SubmitResourceFunc,
  options: StaticDownloadOptions
): DownloadResource => {
  const api = options?.meta?.nodeApiPath;
  // res.savePath = "nodejs.cn\api-v14\index.html"
  // api = "api-v14"
  if (api && typeof api === 'string' && options?.meta?.replaceNodeApiPath) {
    const expectedPrefix = join(HOST, api);
    if (res.savePath.startsWith(expectedPrefix)) {
      res.savePath = res.savePath.replace(expectedPrefix, join(HOST, defaultApiPath));
    }
    if (res.redirectedSavePath &&
      res.redirectedSavePath.startsWith(expectedPrefix)) {
      res.redirectedSavePath = res.redirectedSavePath.replace(
        expectedPrefix, join(HOST, defaultApiPath));
    }
  }
  return res;
};

const initNodeApiPathFromOptions = (
  pipeline: PipelineExecutor, downloader?: DownloaderWithMeta
) => {
  const options = downloader?.options;
  const api = options?.meta?.nodeApiPath;
  if (api && typeof api === 'string') {
    initNodeApiPath(api);
  }
};

const lifeCycle: ProcessingLifeCycle = defaultLifeCycle();
lifeCycle.init.push(initNodeApiPathFromOptions);
lifeCycle.linkRedirect.push(skipProcess(
  (link: string) => !link || link.startsWith('https://github.com/')));
lifeCycle.linkRedirect.push(linkRedirectFunc);
lifeCycle.processBeforeDownload.push(
  dropResource, preProcess(preProcessResource));
lifeCycle.processAfterDownload.unshift(preProcessHtml);
lifeCycle.processAfterDownload.push(
  processHtml(postProcessHtml), postProcessSavePath);

const options: DownloadOptions = defaultDownloadOptions(lifeCycle);
options.logSubDir = HOST;
options.maxDepth = 5;
options.concurrency = 12;
options.initialUrl = [URL_PREFIX + '/' + defaultApiPath + '/'];
options.req.headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
};

export default options;
