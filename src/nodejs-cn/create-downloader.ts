import path from 'path';
import {promises as fs} from 'fs';
import {mkdirpSync as mkdir} from 'mkdirp';
import {SingleThreadDownloader} from 'website-scrap-engine/lib/downloader/single.js';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options.js';

const defaultApiPath = 'api/v22';

export default function createDownloader(
  overrideOptions: Partial<StaticDownloadOptions>
): Promise<SingleThreadDownloader> {
  const api = overrideOptions?.meta?.nodeApiPath as string || defaultApiPath;
  if (api !== defaultApiPath) {
    overrideOptions.initialUrl = [`http://nodejs.cn/${api}/`];
  }
  const downloader: SingleThreadDownloader =
    new SingleThreadDownloader(path.join(__dirname, 'life-cycle'), overrideOptions);
  return downloader.init.then(() => {
    downloader.start();
    // if (overrideOptions?.meta?.replaceNodeApiPath) {
    //   api = 'api';
    // }
    const staticPath: string = path.join(downloader.options.localRoot,
      'nodejs.cn', api, 'static');
    mkdir(staticPath);
    const arr: Promise<void>[] = [
      'favicon.png',
      'inject.css',
      'inject.js'
    ].map(f => fs.copyFile(path.join(__dirname, f), path.join(staticPath, f)));
    return Promise.all(arr);
  }).then(() => downloader);
}
