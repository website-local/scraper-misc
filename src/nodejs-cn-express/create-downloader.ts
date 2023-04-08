import path from 'path';
import {SingleThreadDownloader} from 'website-scrap-engine/lib/downloader';
import type {StaticDownloadOptions} from 'website-scrap-engine/lib/options';

export default function createDownloader(
  overrideOptions: Partial<StaticDownloadOptions>
): Promise<SingleThreadDownloader> {
  const downloader: SingleThreadDownloader =
    new SingleThreadDownloader(path.join(__dirname, 'life-cycle'), overrideOptions);
  return downloader.init.then(() => downloader);
}
