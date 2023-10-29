import {Resource, ResourceType} from 'website-scrap-engine/lib/resource';
import type {
  ProcessingLifeCycle
} from 'website-scrap-engine/lib/life-cycle/types';
import {defaultLifeCycle} from 'website-scrap-engine/lib/life-cycle';
import type {
  DownloadOptions,
  StaticDownloadOptions
} from 'website-scrap-engine/lib/options';
import {defaultDownloadOptions,} from 'website-scrap-engine/lib/options';
import type {Cheerio} from 'website-scrap-engine/lib/types';
import {preProcessHtml} from './process-html';
import type {
  PipelineExecutor
} from 'website-scrap-engine/lib/life-cycle/pipeline-executor';
import type {
  DownloaderWithMeta
} from 'website-scrap-engine/lib/downloader/types';

const initialUrl: string[] = [];

function init(
  pipeline: PipelineExecutor, downloader?: DownloaderWithMeta
) {
  const prefix = downloader?.options.meta.prefix as string;
  if (!prefix) {
    throw new TypeError('init: meta.prefix is required, example val: eslint.nodejs.cn');
  }
  const url = `https://${prefix}/`;
  initialUrl.push(url);
}

function skipExternalLink(
  res: Resource, element: Cheerio | null,
  parent: Resource | null,
  options: StaticDownloadOptions
) {
  const prefix = options.meta.prefix as string;
  const url = res.url;
  if (!url.startsWith(`http://${prefix}/`) &&
    !url.startsWith(`https://${prefix}/`) &&
    element?.is('a')) {
    return;
  }
  return res;
}

const lifeCycle: ProcessingLifeCycle = defaultLifeCycle();
lifeCycle.init.push(init);
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
options.maxDepth = 4;
options.concurrency = 12;
options.initialUrl = initialUrl;
options.req.headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
};

export default options;
