import { registerHooks } from 'node:module';

/*
 * Lets `node --test` load the copy-rule files unmodified.
 *
 * They are written for Vite, which resolves `./billing` to `./billing.js`.
 * Node's ESM loader does not — it requires the extension. Since those files are
 * byte-identical copies of the phone app's and must stay that way, the resolver
 * bends rather than the source.
 *
 * Only relative specifiers with no extension are retried, and only after Node's
 * own resolution has already failed, so nothing that resolves normally changes
 * behaviour.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);

      if (isRelative && !hasExtension) {
        return nextResolve(`${specifier}.js`, context);
      }

      throw error;
    }
  },
});
