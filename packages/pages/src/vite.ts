import { basename, dirname, join } from 'pathe'
import { build } from 'vite'
import type { StaticPageExports } from '@wilson/types'
import type { Options } from './types'

const pageBuildsByPathCache = new Map<string, string>()

/**
 * Performs an SSR build of a page with vite.
 */
async function performViteBuild(
  options: Options,
  input: string,
  outputFilename: string,
): Promise<void> {
  await build({
    clearScreen: false,
    build: {
      emptyOutDir: false,
      outDir: `${options.tempDir}/pages`,
      rollupOptions: { input, output: { entryFileNames: outputFilename } },
      ssr: true,
    },
    logLevel: 'silent',
  })
}

/**
 * Replaces opening bracket on start of given string and
 * closing bracket on end of given string with underscores.
 */
function replaceBrackets(string: string): string {
  return string.replace(/^\[/, '_').replace(/\]$/, '_')
}

/**
 * Returns output filename for vite build of the given page path.
 * @param options Plugin options, based on `siteConfig`
 * @param absolutePath Absolute path of the page
 * @returns Output filename
 */
function getOutputFilename(options: Options, absolutePath: string): string {
  const relativePath = absolutePath.replace(new RegExp(`^${options.pagesDir}`), '')
  const dirName = dirname(relativePath).replace(/^\//, '') || '.'
  const directoryPart = dirName === '.' ? '' : `${replaceBrackets(dirName)}/`
  const baseName = basename(absolutePath)
  const filenamePart = replaceBrackets(baseName.slice(0, baseName.lastIndexOf('.')))
  return `${directoryPart}${filenamePart}.js`
}

/**
 * Deletes an entry from the page builds cache.
 * @param absolutePath Absolute path of the page to delete from the cache
 * @returns `true` if an element was removed, `false` if no element existed for the given key
 */
export function clearPageBuild(absolutePath: string): boolean {
  return pageBuildsByPathCache.delete(absolutePath)
}

/**
 * Returns the module exports of a page.
 *
 * @param config Wilson site config
 * @param absolutePath Absolute path of the page to retrieve exports from
 * @param path Page path relative to the `pagesDir`
 * @returns Exports of the page
 */
export async function getPageExports<T extends StaticPageExports>(
  options: Options,
  absolutePath: string,
): Promise<T> {
  let importPath = pageBuildsByPathCache.get(absolutePath)
  let cacheBustingImportPath: string

  if (importPath !== undefined) {
    cacheBustingImportPath = importPath
  } else {
    const outputFilename = getOutputFilename(options, absolutePath)
    await performViteBuild(options, absolutePath, outputFilename)
    importPath = join(process.cwd(), '.wilson/pages', outputFilename)

    // There is no import cache invalidation in nodejs, so we need to append
    // a unique query string to the import to force node to actually import the file
    // instead of reading from cache.
    //
    // This will increase memory usage because old versions of the imported file will
    // stay cached. If this becomes a problem, we could think about working with `eval`
    // instead of importing the file - but that comes with it's own caveats.
    //
    // @see https://github.com/nodejs/modules/issues/307
    cacheBustingImportPath = `${importPath}?update=${Date.now()}`

    pageBuildsByPathCache.set(absolutePath, importPath)
  }

  const pageExports = (await import(cacheBustingImportPath)) as T
  return pageExports
}
