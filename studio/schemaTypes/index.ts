import { defineArrayMember, defineField, defineType } from "sanity";

const link = defineArrayMember({
  type: "object",
  name: "link",
  fields: [
    defineField({ name: "label", type: "string", validation: (r) => r.required() }),
    defineField({ name: "href", title: "URL", type: "url", validation: (r) => r.required().uri({ scheme: ["https", "http", "mailto"] }) }),
  ],
});

const orderRank = defineField({
  name: "orderRank",
  title: "Order",
  description: "Lower numbers appear first.",
  type: "number",
  initialValue: 10,
});

/** Placeable block textures that can label a skill group. */
const BLOCK_ICONS = ["grass", "dirt", "stone", "oak", "leaves", "sand", "amethyst", "blossom", "bricks", "obsidian", "emberrock", "deepslate"];

export const profile = defineType({
  name: "profile",
  title: "Profile",
  type: "document",
  fields: [
    defineField({ name: "name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "headline", type: "string", description: "One line under your name.", validation: (r) => r.required().max(90) }),
    defineField({ name: "intro", type: "text", rows: 3, validation: (r) => r.required().max(400) }),
    defineField({ name: "bio", title: "About paragraphs", type: "array", of: [{ type: "text", rows: 4 }] }),
    defineField({ name: "email", type: "string", validation: (r) => r.required().email() }),
    defineField({ name: "location", type: "string", description: "City and country, e.g. Taytay, Rizal, Philippines." }),
    defineField({ name: "resume", title: "Résumé (PDF)", type: "file", options: { accept: "application/pdf" } }),
    defineField({ name: "links", title: "Profile links", type: "array", of: [link] }),
    defineField({ name: "availability", type: "string", description: "For example: Open to internships and junior roles." }),
    defineField({
      name: "education",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({ name: "school", type: "string", validation: (r) => r.required() }),
            defineField({ name: "detail", type: "string", description: "Degree or level, e.g. BS Information Technology, 4th year." }),
            defineField({ name: "place", type: "string" }),
            defineField({ name: "year", type: "string" }),
          ],
        }),
      ],
    }),
    defineField({ name: "certificates", type: "array", of: [{ type: "string" }] }),
  ],
});

export const project = defineType({
  name: "project",
  title: "Project",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", type: "slug", options: { source: "title" }, validation: (r) => r.required() }),
    defineField({ name: "context", type: "string", description: "What kind of project, e.g. Capstone project, Game jam, Hackathon." }),
    defineField({ name: "summary", type: "text", rows: 2, validation: (r) => r.required().max(220) }),
    defineField({ name: "role", title: "Your role", type: "string", validation: (r) => r.required() }),
    defineField({ name: "year", type: "string" }),
    defineField({ name: "tech", title: "Technologies", type: "array", of: [{ type: "string" }], options: { layout: "tags" } }),
    defineField({
      name: "image",
      title: "Screenshot",
      type: "image",
      fields: [defineField({ name: "alt", title: "Alternative text", type: "string", validation: (r) => r.required() })],
    }),
    defineField({
      name: "imageDark",
      title: "Dark-theme screenshot",
      description: "Optional. Shown instead of the screenshot when the site is switched to night.",
      type: "image",
      fields: [defineField({ name: "alt", title: "Alternative text", type: "string", validation: (r) => r.required() })],
    }),
    defineField({ name: "contribution", title: "What I did", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "decisions",
      title: "Key decisions",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({ name: "title", type: "string", validation: (r) => r.required() }),
            defineField({ name: "body", type: "text", rows: 3, validation: (r) => r.required() }),
          ],
        }),
      ],
    }),
    defineField({ name: "results", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "links", type: "array", of: [link] }),
    orderRank,
  ],
  orderings: [{ title: "Order", name: "order", by: [{ field: "orderRank", direction: "asc" }] }],
});

export const skillGroup = defineType({
  name: "skillGroup",
  title: "Skill group",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "icon", title: "Block icon", type: "string", description: "Any block id from the site, e.g. stone, oak, amethyst.", options: { list: BLOCK_ICONS }, initialValue: "stone" }),
    defineField({ name: "items", type: "array", of: [{ type: "string" }], options: { layout: "tags" } }),
    orderRank,
  ],
});

export const exploration = defineType({
  name: "exploration",
  title: "Exploration",
  type: "document",
  fields: [
    defineField({ name: "title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "area",
      type: "string",
      options: { list: ["Game development", "Applied AI", "Systems"] },
      validation: (r) => r.required(),
    }),
    defineField({ name: "description", type: "text", rows: 3, validation: (r) => r.required() }),
    defineField({
      name: "link",
      type: "object",
      fields: [defineField({ name: "label", type: "string" }), defineField({ name: "href", title: "URL", type: "url" })],
    }),
    orderRank,
  ],
});

export const schemaTypes = [profile, project, skillGroup, exploration];
