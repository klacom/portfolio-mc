import type { SiteContent } from "./types";

/**
 * Content used when Sanity isn't configured (see .env.example).
 * Taken from Klarenz's résumé. The page leaves the phone number out; the downloadable PDF has it.
 */
export const fallbackContent: SiteContent = {
  profile: {
    name: "Klarenz Cobie Manrique",
    headline: "IT student building for the web, mobile, and games.",
    // Words in [square brackets] render as a key chip, like the [Build] button in the header.
    intro: "I'm a fourth-year Information Technology student who ships full-stack apps, mobile tools and games. This page is one of my builds: press [Build] and change the world around it.",
    bio: [
      "I study BS Information Technology at Pamantasan ng Lungsod ng Pasig and graduate in 2027. Before programming, I spent five years as an assistant at a computer café in Taytay, Rizal, fixing desktops, printing, and helping customers. It taught me to troubleshoot calmly and explain technical things plainly.",
    ],
    email: "klarenzcobie99@gmail.com",
    location: "Taytay, Rizal, Philippines",
    // The downloadable résumé in public/resume. It includes a phone number, which the page itself leaves out.
    resumeUrl: "/resume/Klarenz-Cobie-Manrique-Resume.pdf",
    links: [{ label: "GitHub", href: "https://github.com/klacom" }],
    availability: "Graduating in 2027 and open to opportunities.",
    education: [
      { school: "Pamantasan ng Lungsod ng Pasig", detail: "BS Information Technology, 4th year", place: "Pasig City", year: "Expected 2027" },
      { school: "Arellano University, Bonifacio Campus", detail: "Senior High School, with High Honors", place: "Pasig City", year: "2023" },
      { school: "Antonio C. Esguerra Memorial National High School", detail: "High School, with High Honors", place: "Taytay, Rizal", year: "2021" },
    ],
    certificates: [
      "Certificate of Recognition and People's Choice, GameCon! Game Jam Manila 2025 (DEVCON Manila)",
      "C++ Programming Competition, ISITE National IT Skills Competition",
      "AppBuildersPH Hackathon, Cyberzone SM Makati",
    ],
  },
  projects: [
    {
      slug: "ecopin",
      title: "EcoPin",
      context: "Capstone project",
      summary: "A cleaner Pasig starts with us: residents pin waste concerns on a city map, and Pasig City's Solid Waste Management Office dispatches crews, records cleanup evidence and tracks each barangay.",
      role: "Full-stack developer",
      year: "",
      tech: ["Web", "Mobile", "Python", "AWS"],
      image: { src: "/projects/ecopin.webp", alt: "EcoPin's home page: the headline \"A cleaner Pasig starts with us\" above a map of Pasig dotted with report pins.", width: 1600, height: 1000 },
      imageDark: { src: "/projects/ecopin-dark.webp", alt: "EcoPin's home page in its dark theme: the headline \"A cleaner Pasig starts with us\" above a dark map of Pasig dotted with report pins.", width: 1600, height: 999 },
      contribution: [
        "Built web, mobile and backend features for citizen reports, crew dispatch, cleanup evidence and barangay analytics.",
        "Implemented offline synchronisation so crews can keep working without a connection.",
        "Wrote Python routing and forecasting services.",
        "Added privacy controls and automated AWS deployment pipelines.",
      ],
      decisions: [],
      results: ["Built for the Pasig City Solid Waste Management Office as my capstone project."],
      links: [
        { label: "Visit the live site", href: "https://ecopin-web.vercel.app/" },
        { label: "Web app code", href: "https://github.com/baldopadua/ecopin-web" },
        { label: "Mobile app code", href: "https://github.com/klacom/ecopin_app" },
        { label: "Backend code", href: "https://github.com/klacom/ecopin_backend_node" },
        { label: "ML models code", href: "https://github.com/klacom/ecopin_ml_models" },
      ],
    },
    {
      slug: "plooy",
      title: "Plooy",
      context: "Game jam",
      summary: "A game my team made for GameCon! Game Jam Manila 2025. I led the programming in Godot.",
      role: "Lead programmer",
      year: "2025",
      tech: ["Godot", "GDScript"],
      image: { src: "/projects/plooy.webp", alt: "Plooy's title screen: the pixel-art Plooy logo with Start and Tutorial buttons, over a dark space background.", width: 1600, height: 907 },
      imageDark: null,
      contribution: ["Developed the game's features in Godot and GDScript as the team's lead programmer."],
      decisions: [],
      results: ["Won 2nd place at DEVCON Manila's GameCon! Game Jam Manila 2025.", "Received the People's Choice recognition."],
      links: [{ label: "Play it on itch.io", href: "https://artsaac.itch.io/plooy" }],
    },
    {
      slug: "tanggolin",
      title: "Tanggolin",
      context: "Hackathon",
      summary: "A second thought before you send: an Android keyboard whose on-device AI catches secrets before they leave your phone. Built for the AppBuildersPH Hackathon.",
      role: "Programmer",
      year: "",
      tech: ["Kotlin", "ONNX"],
      image: { src: "/projects/tanggolin.webp", alt: "Tanggolin's title card: a curled-up pangolin logo above the tagline \"A second thought before you send.\"", width: 1600, height: 900 },
      imageDark: null,
      contribution: ["Wrote the Kotlin keyboard logic.", "Integrated quantized ONNX inference so the model runs on the phone."],
      decisions: [],
      results: ["Our team was one of 12 finalists out of more than 280 teams."],
      links: [{ label: "Code on GitHub", href: "https://github.com/baldopadua/App-Builders-Hackathon" }],
    },
  ],
  skillGroups: [
    { title: "Languages", icon: "stone", items: ["TypeScript", "JavaScript", "Python", "Kotlin", "Java", "C++", "C#", "Dart", "PHP", "GDScript", "Lua", "Visual Basic"] },
    { title: "Frameworks and platforms", icon: "oak", items: ["Next.js", "Node.js", ".NET", "Flutter", "Godot", "Docker"] },
    { title: "Data and cloud", icon: "amethyst", items: ["PostgreSQL", "MySQL", "Supabase", "AWS EC2 and Lambda", "GitHub Actions", "Google OR-Tools", "ONNX"] },
    { title: "Design and media", icon: "blossom", items: ["Figma", "Photoshop", "Canva", "Premiere Pro", "CapCut"] },
  ],
  explorations: [
    { title: "Game jams in Godot", area: "Game development", description: "Building small, playable games in Godot under game jam time limits.", link: null },
    { title: "AI that runs on the phone", area: "Applied AI", description: "Quantizing models and running them with ONNX so they work offline on ordinary phones.", link: null },
    { title: "Routing and forecasting", area: "Systems", description: "Python routing and forecasting services behind a city cleanup platform.", link: null },
  ],
};
