require("dotenv").config();
const fs = require("fs");
const path = require("path");
const logger = require("consola").withScope("@lihbr/lihbr-apex.core");

const ci = require("@lihbr/utils-netlify.ci");
const envConfig = require("@lihbr/utils-nuxt.env");
const datalayer = require("@lihbr/lihbr-apex.datalayer");

const pkg = require("./package.json");

module.exports = async () => {
  const dlStartTime = Date.now();
  // Load datalayer global content
  const dlGlobal = await datalayer.content.global.fetch();
  // Write datalayer global to filesystem for cache invalidation
  fs.writeFileSync(
    "datalayer.global.snapshot.json",
    JSON.stringify(dlGlobal),
    "utf-8"
  );
  // Load datalayer routes content
  const dlRoutes = await datalayer.content.routes.fetch(dlGlobal);
  const dlEndTime = Date.now();

  // Inject Netlify deploy context URL
  if (ci.isNetlify()) {
    process.env.APP_URL = ci.getFinalDeployUrl({ branchDomains: ["staging"] });
    logger.info(`Deploying on: ${process.env.APP_URL}`);
  }

  // Configure application environment
  const env = envConfig(pkg, dlGlobal.settings, {
    settings: dlGlobal.settings,
    arts: dlGlobal.arts
  });

  // Logging
  logger.info(`Datalayer content fetched in ${dlEndTime - dlStartTime} ms`);
  logger.info(
    "Found routes:\n",
    dlRoutes.map(i => i.route || i)
  );

  return {
    /*
     ** Application target
     */
    target: "static",

    /*
     ** Build target
     */
    modern: env.DEV ? false : "client",

    /*
     ** Application directory
     */
    srcDir: "src/",

    /*
     ** Generate
     */
    generate: {
      crawler: false,
      fallback: true,
      routes: dlRoutes
    },

    /*
     ** Head of the page, handled by head module
     */
    head: {},

    /*
     ** Customize the progress-bar color
     */
    loading: { color: env.APP_ACCENT_COLOR },

    /*
     ** Global CSS
     */
    css: [
      "fontsource-antic-slab/latin-400.css",
      "fontsource-roboto/latin-300.css",
      "fontsource-roboto/latin-700.css",
      "~/assets/sass/style.sass"
    ],

    /*
     ** Plugins to load before mounting the App
     */
    plugins: [
      "~/plugins/polyfills.client",
      "~/plugins/logger",
      "~/plugins/smart-link",
      "~/plugins/filters",
      "~/plugins/preview"
    ],

    /*
     ** Nuxt.js modules
     */
    modules: [
      [
        "@nuxtjs/sentry",
        {
          dsn: process.env.SENTRY_DSN,
          disabled: env.DEV,
          disableServerSide: true,
          publishRelease: false, // TODO: implement release (https://docs.sentry.io/product/releases / https://github.com/getsentry/sentry-netlify-build-plugin)
          clientIntegrations: {
            Dedupe: {},
            ExtraErrorData: {},
            ReportingObserver: {},
            RewriteFrames: {},
            Vue: { attachProps: true, logErrors: true }
          },
          config: {
            environment: (() => {
              if (process.env.NETLIFY) {
                return process.env.BRANCH === "master"
                  ? "production"
                  : process.env.BRANCH.replace(/[\/\s]/g, "-");
              } else {
                return "development";
              }
            })()
          }
        }
      ]
    ],

    /*
     ** Nuxt.js build modules
     */
    buildModules: [
      [
        "@lihbr/utils-nuxt.head",
        {
          lang: env.APP_LANG,
          name: env.APP_NAME,
          description: env.APP_DESC,
          metaImage: {
            og: env.APP_METAIMG_OG,
            tw: env.APP_METAIMG_TW
          },
          twitterHandle: env.APP_TWITTER_HANDLE,
          backgroundColor: env.APP_BACKGROUND_COLOR,
          accentColor: env.APP_ACCENT_COLOR,
          titleFormat: env.APP_TITLE_FORMAT,
          url: env.APP_URL
        }
      ],
      "@lihbr/utils-nuxt.payload",
      "@lihbr/utils-nuxt.statistics",
      [
        "@nuxtjs/eslint-module",
        {
          context: path.join(__dirname, "../.."),
          files: "packages/core/src"
        }
      ],
      [
        "@nuxtjs/tailwindcss",
        {
          configPath: "~~/tailwind.config.js",
          exposeConfig: false
        }
      ],
      "@nuxtjs/global-components",
      "@nuxtjs/feed",
      [
        "@nuxtjs/sitemap",
        {
          hostname: env.APP_URL,
          gzip: true,
          exclude: ["/preview"]
        }
      ],
      ["@nuxtjs/netlify-files", { existingFilesDirectory: __dirname }],
      [
        "@nuxtjs/gtm",
        {
          id: env.GTM_ID,
          pageTracking: true,
          pageViewEventName: "nuxtRoute",
          respectDoNotTrack: env.GTM_FRIENDLY,
          enabled: !env.DEV
        }
      ],
      [
        "@nuxtjs/pwa",
        {
          workbox: {
            clientsClaim: false,
            offlineAnalytics: !!env.GTM_ID,
            // Register image CDN here
            runtimeCaching: [
              {
                urlPattern: `https://images.prismic.io/${process.env.PRISMIC_REPO}/.*`,
                handler: "networkFirst"
              }
            ]
          },
          meta: false,
          icon: {
            plugin: false
          },
          manifest: {
            display: "browser", // disable "Add to Home Screen" button
            lang: env.APP_LANG,
            name: env.APP_NAME,
            short_name: env.APP_NAME,
            description: env.APP_DESC,
            background_color: env.APP_BACKGROUND_COLOR,
            theme_color: env.APP_ACCENT_COLOR
          }
        }
      ],
      "nuxt-svg-loader"
    ],

    /*
     ** Feed
     */
    feed: [
      {
        path: "/blog/rss.xml",
        create(feed, { limit = 25 } = {}) {
          feed.options = {
            title: env.APP_NAME,
            description: env.APP_DESC,
            link: `${env.APP_URL}/blog/rss.xml`,
            language: "en",
            image: env.APP_METAIMG_OG,
            favicon: `${env.APP_URL}/favicon.ico`,
            generator: "@nuxtjs/feed"
          };

          // Get last <limit> blog posts
          const blogPosts = dlRoutes
            .filter(
              route =>
                typeof route === "object" && route.route.startsWith("/blog/")
            )
            .sort(({ payload: a }, { payload: b }) =>
              a.published_date < b.published_date ? 1 : -1
            )
            .slice(0, limit);

          // Add blog posts to feed
          for (const blogPost of blogPosts) {
            const { payload } = blogPost;

            const item = {
              title: payload.title,
              id: `${env.APP_URL}${payload._ctx.href}`,
              link: `${env.APP_URL}${payload._ctx.href}`,
              date: new Date(payload.published_date)
            };

            item.content = `I've posted a new article <em>"${payload.title}"</em>, you can <a href="${item.link}" title="${payload.title}">read it here</a>.<br />${payload.lead_text}`;

            if (payload.thumbnail && payload.thumbnail.url) {
              item.image = payload.thumbnail.url.replace(/&/g, "&amp;");
            }

            feed.addItem(item);
          }
        },
        cacheTime: 1000 * 60 * 24, // 1 day
        type: "rss2",
        data: { limit: 25 }
      }
    ],

    /*
     ** Env
     */
    env: {
      PRISMIC_REPO: process.env.PRISMIC_REPO,
      ...env
    },

    /*
     ** Server configuration
     */
    server: {
      host: env.APP_HOST,
      port: env.APP_PORT
    },

    /*
     ** Build
     */
    build: {
      html: {
        minify: {
          minifyCSS: false,
          minifyJS: false
        }
      }
    }
  };
};
