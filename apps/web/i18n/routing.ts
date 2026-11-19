import { defineRouting } from 'next-intl/routing';

// Arabic first, with right-to-left layout (C-51)
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
});
