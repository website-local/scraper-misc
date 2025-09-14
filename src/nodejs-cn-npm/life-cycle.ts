import type {Resource} from 'website-scrap-engine/lib/resource.js';
import { ResourceType} from 'website-scrap-engine/lib/resource.js';
import type {
  ProcessingLifeCycle
} from 'website-scrap-engine/lib/life-cycle/types.js';
import {defaultLifeCycle} from 'website-scrap-engine/lib/life-cycle/default-life-cycle.js';
import type {
  DownloadOptions,
} from 'website-scrap-engine/lib/options.js';
import {defaultDownloadOptions,} from 'website-scrap-engine/lib/options.js';
import type {Cheerio} from 'website-scrap-engine/lib/types.js';
import {preProcessHtml} from './process-html.js';
import URI from 'urijs';
import {hostnames} from './keys.js';

const initialUrl: string[] = [];

function init() {
  for (const hostname of hostnames) {
    const url = `https://${hostname}/`;
    initialUrl.push(url);
  }
}

function skipExternalLink(
  res: Resource, element: Cheerio | null,
) {
  const uri = res.uri || URI(res.url);
  const host = uri.host();
  if (!hostnames.has(host) &&
    (element?.is('a') || element?.is('iframe'))) {
    return;
  }
  return res;
}

function fixBadNpmLink(url: string): string {
  if (!url) {
    return url;
  }
  const prefixArr = [
    ['https://docs.npmjs.com', 'https://docs.npmjs.com/'],
  ];
  for (const prefix of prefixArr) {
    if (url.startsWith(prefix[0]) && !url.startsWith(prefix[1])) {
      url = url.replace(prefix[0], prefix[1]);
      break;
    }
  }
  return url;
}

function skipBadUrl(url: string): string | void {
  if (!url) {
    return url;
  }
  // protocol not supported, skipping pathnamme pathnamme:///pst/enron.pst
  if (url.startsWith('pathnamme:') ||
    // protocol not supported, skipping hhttps hhttps://support.microsoft.com/
    url.startsWith('hhttps:') ||
    // protocol not supported, skipping mail mail:team@babeljs.io
    url.startsWith('mail:') ||
    url.startsWith('vscode:') ||
    // TypeError: Port "99%22" is not a valid port
    url.includes(':99%22/') ||
    // TypeError: Port "port" is not a valid port
    // https://electron.nodejs.cn/docs/latest/api/command-line-switches/
    url.startsWith('http://host:port/') ||
    url.startsWith('http://localhost:3001/') ||
    url.startsWith('http://localhost:') ||
    url.startsWith('http://localhost/')) {
    return;
  }
  return url;
}

const lifeCycle: ProcessingLifeCycle = defaultLifeCycle();
lifeCycle.init.push(init);
lifeCycle.linkRedirect.push(fixBadNpmLink, skipBadUrl);
lifeCycle.processBeforeDownload.push(skipExternalLink);
lifeCycle.processAfterDownload.unshift(preProcessHtml);
lifeCycle.processAfterDownload.push((res) => {
  if (res.type !== ResourceType.Html) {
    return res;
  }
  if (!res.meta.doc) {
    return res;
  }
  const $ = res.meta.doc;
  // remove all scripts
  $('script').remove();
  return res;
});

const options: DownloadOptions = defaultDownloadOptions(lifeCycle);
options.maxDepth = 12;
options.concurrency = 12;
options.initialUrl = initialUrl;
options.req.headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
};

export default options;
