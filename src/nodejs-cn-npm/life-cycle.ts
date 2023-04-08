import {Resource} from 'website-scrap-engine/lib/resource';
import type {
  ProcessingLifeCycle
} from 'website-scrap-engine/lib/life-cycle/types';
import {defaultLifeCycle} from 'website-scrap-engine/lib/life-cycle';
import {
  defaultDownloadOptions,
  DownloadOptions
} from 'website-scrap-engine/lib/options';
import type {Cheerio} from 'website-scrap-engine/lib/types';
import {preProcessHtml} from './process-html';

const skipExternalLink = (res: Resource, element: Cheerio | null) => {
  const url = res.url;
  if (!url.startsWith('http://nodejs.cn/npm/') &&
    !url.startsWith('https://nodejs.cn/npm/') &&
    element?.is('a')) {
    return;
  }
  return res;
};

const lifeCycle: ProcessingLifeCycle = defaultLifeCycle();
lifeCycle.processBeforeDownload.push(skipExternalLink);
lifeCycle.processAfterDownload.unshift(preProcessHtml);
const options: DownloadOptions = defaultDownloadOptions(lifeCycle);
options.maxDepth = 4;
options.concurrency = 12;
options.initialUrl = ['http://nodejs.cn/npm/'];
options.req.headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
};

export default options;
