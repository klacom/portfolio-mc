import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";

// Public identifiers only. Set them in studio/.env (see README); never commit tokens.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? "";
const dataset = process.env.SANITY_STUDIO_DATASET ?? "production";

export default defineConfig({
  name: "default",
  title: "Portfolio content",
  projectId,
  dataset,
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            S.listItem().title("Profile").id("profile").child(S.document().schemaType("profile").documentId("profile")),
            S.divider(),
            S.documentTypeListItem("project").title("Projects"),
            S.documentTypeListItem("skillGroup").title("Skill groups"),
            S.documentTypeListItem("exploration").title("Exploration"),
          ]),
    }),
    visionTool(),
  ],
  schema: { types: schemaTypes },
});
