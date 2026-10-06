import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import {
  dictionaries,
  GITHUB_URL,
  type Locale,
  PROFILES,
  pagePath,
  type Route,
  relative,
} from "../i18n";

type PageProps = { locale: Locale };

function Section(props: { children: JSX.Element; title: string }) {
  return (
    <section>
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

function Command(props: { children: string }) {
  return (
    <pre>
      <code>{props.children}</code>
    </pre>
  );
}

export function HomePage(props: PageProps) {
  const copy = dictionaries[props.locale].home;
  const here = pagePath(props.locale, "home");
  return (
    <>
      <div class="hero">
        <div>
          <span class="badge">{copy.badge}</span>
          <h1>
            {copy.headingLine1}
            <br />
            {copy.headingLine2}
          </h1>
          <p class="lead">{copy.lead}</p>
          <div class="actions">
            <a
              class="studio-button studio-button--primary studio-button--comfortable"
              href={relative(here, pagePath(props.locale, "gettingStarted"))}
            >
              {copy.primary}
            </a>
            <a
              class="studio-button studio-button--secondary studio-button--comfortable"
              href={GITHUB_URL}
              rel="noopener"
            >
              {copy.secondary}
            </a>
          </div>
          <p class="status-line">{copy.status}</p>
        </div>
        <figure class="media">
          <img
            alt={copy.mediaAlt}
            height="690"
            src={relative(here, "media/design-preview-simulator.png")}
            width="340"
          />
          <figcaption>{copy.mediaCaption}</figcaption>
        </figure>
      </div>
      <div class="features">
        <div>
          <h2>{copy.featureUsersTitle}</h2>
          <p>{copy.featureUsersBody}</p>
        </div>
        <div>
          <h2>{copy.featureInspectTitle}</h2>
          <p>{copy.featureInspectBody}</p>
        </div>
        <div>
          <h2>{copy.featureFocusTitle}</h2>
          <p>{copy.featureFocusBody}</p>
        </div>
      </div>
      <div class="band">
        <div>
          <h2>{copy.profilesTitle}</h2>
          <p class="ltr">{copy.profilesList}</p>
          <small>{copy.profilesNote}</small>
        </div>
        <a
          class="studio-button studio-button--secondary studio-button--comfortable"
          href={relative(here, pagePath(props.locale, "compatibility"))}
        >
          {copy.profilesAction}
        </a>
      </div>
    </>
  );
}

export function DownloadPage(props: PageProps) {
  const copy = dictionaries[props.locale].download;
  const nav = dictionaries[props.locale].nav;
  const here = pagePath(props.locale, "download");
  return (
    <div class="page">
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
      <p class="notice">{copy.notice}</p>
      <Section title={copy.sourceTitle}>
        <p>{copy.sourceBody}</p>
        <p>
          <a href={relative(here, pagePath(props.locale, "gettingStarted"))}>
            {nav.gettingStarted}
          </a>
        </p>
      </Section>
    </div>
  );
}

export function GettingStartedPage(props: PageProps) {
  const copy = dictionaries[props.locale].gettingStarted;
  return (
    <div class="page">
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
      <Section title={copy.requirementsTitle}>
        <p>{copy.requirementsBody}</p>
      </Section>
      <Section title={copy.installTitle}>
        <Command>bun install --frozen-lockfile</Command>
      </Section>
      <Section title={copy.runTitle}>
        <p>{copy.runBody}</p>
        <Command>bun run dev</Command>
      </Section>
      <Section title={copy.buildTitle}>
        <p>{copy.buildBody}</p>
        <Command>bun run build:studio</Command>
      </Section>
    </div>
  );
}

export function CompatibilityPage(props: PageProps) {
  const copy = dictionaries[props.locale].compatibility;
  return (
    <div class="page">
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{copy.profile}</th>
              <th scope="col">{copy.status}</th>
            </tr>
          </thead>
          <tbody>
            <For each={PROFILES}>
              {(profile) => (
                <tr>
                  <th class="ltr" scope="row">
                    {profile}
                  </th>
                  <td>{copy.inDevelopment}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Section title={copy.engineTitle}>
        <p>{copy.engineBody}</p>
      </Section>
      <Section title={copy.fontsTitle}>
        <p>{copy.fontsBody}</p>
      </Section>
    </div>
  );
}

export function ChangelogPage(props: PageProps) {
  const copy = dictionaries[props.locale].changelog;
  return (
    <div class="page">
      <h1>{copy.title}</h1>
      <Section title={copy.versionTitle}>
        <p>{copy.versionBody}</p>
      </Section>
    </div>
  );
}

export function PrivacyPage(props: PageProps) {
  const copy = dictionaries[props.locale].privacy;
  return (
    <div class="page">
      <h1>{copy.title}</h1>
      <Section title={copy.siteTitle}>
        <p>{copy.siteBody}</p>
      </Section>
      <Section title={copy.appTitle}>
        <p>{copy.appBody}</p>
      </Section>
      <Section title={copy.reportsTitle}>
        <p>{copy.reportsBody}</p>
      </Section>
    </div>
  );
}

export function SupportPage(props: PageProps) {
  const copy = dictionaries[props.locale].support;
  return (
    <div class="page">
      <h1>{copy.title}</h1>
      <Section title={copy.issuesTitle}>
        <p>{copy.issuesBody}</p>
        <p>
          <a href={`${GITHUB_URL}/issues`} rel="noopener">
            {copy.issuesAction}
          </a>
        </p>
      </Section>
      <Section title={copy.securityTitle}>
        <p>{copy.securityBody}</p>
      </Section>
      <Section title={copy.sponsorTitle}>
        <p>{copy.sponsorBody}</p>
      </Section>
    </div>
  );
}

export const pages: Record<Route, (props: PageProps) => JSX.Element> = {
  changelog: ChangelogPage,
  compatibility: CompatibilityPage,
  download: DownloadPage,
  gettingStarted: GettingStartedPage,
  home: HomePage,
  privacy: PrivacyPage,
  support: SupportPage,
};

export function pageTitle(locale: Locale, route: Route): string {
  const copy = dictionaries[locale];
  return route === "home"
    ? copy.home.title
    : `${copy.nav[route]} · ${copy.meta.siteName}`;
}
