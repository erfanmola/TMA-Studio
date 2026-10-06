import { dictionaries, directionFor, LOCALES } from "../i18n/locale";

export default function LoadingScenes() {
  return (
    <main
      aria-label={dictionaries.en.loading.galleryTitle}
      class="loading-gallery"
      lang="en"
      dir="ltr"
    >
      {LOCALES.map((locale) => (
        <article
          aria-busy="true"
          aria-label={dictionaries[locale].locale.name}
          class="loading-gallery__scene"
          data-locale={locale}
          dir={directionFor(locale)}
          lang={locale}
        >
          <span aria-hidden="true" class="loading-gallery__indicator" />
          <div aria-live="polite" class="loading-gallery__copy" role="status">
            <strong class="loading-gallery__locale">
              {dictionaries[locale].locale.name}
            </strong>
            <h2 class="loading-gallery__title">
              {dictionaries[locale].loading.title}
            </h2>
            <p class="loading-gallery__detail">
              {dictionaries[locale].loading.detail}
            </p>
          </div>
        </article>
      ))}
    </main>
  );
}
