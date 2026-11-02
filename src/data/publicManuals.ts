type GuideContent = { title: string; description: string; steps: string[] };

// Previously registered storefront content stays in storage, but is not advertised.
export function isCurrentPublicManual(manual: GuideContent): boolean {
  return !/쇼핑몰|자사몰|VOG\s*SPORTS|영카트/i.test(
    [manual.title, manual.description, ...manual.steps].join(' ')
  );
}
