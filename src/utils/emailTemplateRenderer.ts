import Handlebars from "handlebars";

import { emailLayoutTemplate } from "../templates/emails/layout.template";

const compiledTemplateCache = new Map<string, HandlebarsTemplateDelegate>();

function getCompiled(name: string, source: string): HandlebarsTemplateDelegate {
  let compiled = compiledTemplateCache.get(name);
  if (!compiled) {
    compiled = Handlebars.compile(source);
    compiledTemplateCache.set(name, compiled);
  }
  return compiled;
}

const compiledLayout = getCompiled("__layout", emailLayoutTemplate);

// Renders a Handlebars content template, then wraps the result in the shared
// email shell (header/footer/styles).
export function renderEmail(
  templateName: string,
  contentTemplateSource: string,
  data: object,
  title: string,
): string {
  const body = getCompiled(templateName, contentTemplateSource)(data);
  return compiledLayout({ body, title, year: new Date().getFullYear() });
}
