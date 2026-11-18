import { newId } from "./ids.js";

export const DISCLAIMER = "General information, not legal advice. Check the source or ask a qualified professional.";
export const CHECKED = "2026-11-18";

const CLASSES = {
  residential: ["1", "2"],
  commercial: ["5", "6", "9"],
  industrial: ["7", "8"]
};

export const SOURCES = [
  {
    id: "ncc-classes",
    title: "National Construction Code, building classification",
    url: "https://ncc.abcb.gov.au/",
    section: "NCC Volume One, Part A6 Building classification, as adopted in Victoria",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["ncc", "bca", "class", "classification", "residential", "commercial", "industrial"],
    excerpt: "The National Construction Code, adopted in Victoria, puts buildings into classes. Class 1 is a house or townhouse. Class 2 is an apartment building. Class 5 is an office. Class 6 is a shop or cafe. Class 7 is storage or a car park. Class 8 is a factory or laboratory. Class 9 is a public building, including health care and assembly. The class for a particular building is on its occupancy documents. This note points to the Code. It does not copy it."
  },
  {
    id: "building-act",
    title: "Building Act 1993 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/building-act-1993",
    section: "Building Act 1993 (Vic)",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["building act", "building permit", "occupancy"],
    excerpt: "The Building Act 1993 is the Victorian Act for building work, building permits and occupancy. Read the Act on the legislation site rather than relying on a summary."
  },
  {
    id: "esm-part-15",
    title: "Building Regulations 2018 (Vic), essential safety measures",
    url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/building-regulations-2018",
    section: "Building Regulations 2018 (Vic), Part 15 Essential safety measures",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["esm", "essential safety", "fire", "maintenance", "annual report", "part 15"],
    excerpt: "Part 15 of the Building Regulations 2018 (Vic) covers maintenance of essential safety measures and the annual essential safety measures report. It applies across building classes where an essential safety measure is required. This note points to Part 15. It does not copy the regulation or set a date for a particular building."
  },
  {
    id: "as-1851",
    title: "AS 1851 routine service of fire protection systems",
    url: "https://www.standards.org.au/",
    section: "AS 1851, as referenced. The standard text is not reproduced.",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["as 1851", "fire maintenance", "sprinkler", "hydrant", "alarm"],
    excerpt: "AS 1851 is the Australian standard often referenced for routine servicing of fire protection systems. The standard is published by Standards Australia and is not copied here. Whether it applies to a building depends on the building's essential safety measures and the Building Regulations."
  },
  {
    id: "vba",
    title: "Victorian Building Authority",
    url: "https://www.vba.vic.gov.au/",
    section: "Victorian Building Authority public guidance",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["vba", "building authority", "permit", "pool"],
    excerpt: "The Victorian Building Authority publishes public guidance for owners, builders and owners corporations. Use its site for current guidance. This note does not add a rule of its own."
  },
  {
    id: "pool",
    title: "Pool and spa barrier guidance",
    url: "https://www.vba.vic.gov.au/consumers/swimming-pools",
    section: "Victorian Building Authority, swimming pools and spas",
    classes: ["1", "2", "9"],
    topics: ["pool", "spa", "barrier", "fence"],
    excerpt: "Pool and spa safety barriers in Victoria are dealt with under the building rules and Victorian Building Authority guidance. Check that page and the Building Regulations for the barrier that applies to the property. This note does not describe a barrier height or a fine."
  },
  {
    id: "oc-act",
    title: "Owners Corporations Act 2006 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/owners-corporations-act-2006",
    section: "Owners Corporations Act 2006 (Vic)",
    classes: ["2"],
    topics: ["owners corporation", "oc act", "common property", "strata"],
    excerpt: "The Owners Corporations Act 2006 (Vic) is the Act for owners corporations, common property and owners corporation decisions. It is the usual Act for apartment buildings. Read the Act itself for a particular duty."
  },
  {
    id: "cav",
    title: "Consumer Affairs Victoria, owners corporations",
    url: "https://www.consumer.vic.gov.au/housing/owners-corporations",
    section: "Consumer Affairs Victoria guidance for owners corporations",
    classes: ["2"],
    topics: ["consumer affairs", "owners corporation", "manager"],
    excerpt: "Consumer Affairs Victoria publishes public guidance for owners corporations and managers. It explains the public rules in plain language and links to the Act. It is guidance, not a decision about a particular building."
  },
  {
    id: "ohs-act",
    title: "Occupational Health and Safety Act 2004 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/occupational-health-and-safety-act-2004",
    section: "Occupational Health and Safety Act 2004 (Vic)",
    classes: ["2", "5", "6", "7", "8", "9"],
    topics: ["ohs", "occupational health", "workplace", "safety"],
    excerpt: "The Occupational Health and Safety Act 2004 (Vic) sets duties for health and safety at workplaces. Whether a building is a workplace depends on the facts. Read the Act and WorkSafe guidance rather than a summary."
  },
  {
    id: "ohs-regs",
    title: "Occupational Health and Safety Regulations 2017 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/statutory-rules/occupational-health-and-safety-regulations-2017",
    section: "Occupational Health and Safety Regulations 2017 (Vic), including plant, asbestos and hazardous substances",
    classes: ["2", "5", "6", "7", "8", "9"],
    topics: ["plant", "asbestos", "dangerous goods", "lift", "ohs regulations"],
    excerpt: "The Occupational Health and Safety Regulations 2017 (Vic) include public requirements for plant, asbestos and hazardous substances. Lifts and other plant can fall under those regulations. This note points to the regulations. It does not copy a clause or a registration date."
  },
  {
    id: "worksafe",
    title: "WorkSafe Victoria",
    url: "https://www.worksafe.vic.gov.au/",
    section: "WorkSafe Victoria public guidance",
    classes: ["2", "5", "6", "7", "8", "9"],
    topics: ["worksafe", "plant registration", "lift", "as 1735"],
    excerpt: "WorkSafe Victoria publishes guidance on plant, including lifts, and on registration of certain plant. AS 1735 is the referenced lift standard series and is not copied here. Check WorkSafe for whether a particular lift must be registered."
  },
  {
    id: "dangerous-goods",
    title: "Dangerous Goods Act 1985 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/dangerous-goods-act-1985",
    section: "Dangerous Goods Act 1985 (Vic)",
    classes: ["6", "7", "8", "9"],
    topics: ["dangerous goods", "chemicals", "storage"],
    excerpt: "The Dangerous Goods Act 1985 (Vic) covers dangerous goods. Storage at a shop, warehouse or factory can be affected. Read the Act and WorkSafe guidance for the quantity and the place. This note states no threshold."
  },
  {
    id: "retail-leases",
    title: "Retail Leases Act 2003 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/retail-leases-act-2003",
    section: "Retail Leases Act 2003 (Vic)",
    classes: ["6"],
    topics: ["retail lease", "shop lease", "commercial lease"],
    excerpt: "The Retail Leases Act 2003 (Vic) deals with retail leases, which commonly apply to shops. It does not apply to every commercial lease. Check the Act to see whether a lease is a retail lease."
  },
  {
    id: "epa",
    title: "Environment Protection Act 2017 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/environment-protection-act-2017",
    section: "Environment Protection Act 2017 (Vic)",
    classes: ["7", "8"],
    topics: ["epa", "environment", "pollution", "waste", "industrial"],
    excerpt: "The Environment Protection Act 2017 (Vic) is the Act administered with EPA Victoria for pollution and waste. Industrial sites are the usual concern. This note does not state a licence condition for a particular site."
  },
  {
    id: "electricity",
    title: "Electricity Safety Act 1998 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/electricity-safety-act-1998",
    section: "Electricity Safety Act 1998 (Vic)",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["electricity", "electrical", "energy safe", "esv"],
    excerpt: "The Electricity Safety Act 1998 (Vic) covers electrical safety. Energy Safe Victoria publishes the public guidance. Use the Act and Energy Safe Victoria rather than a summary for a particular installation."
  },
  {
    id: "gas",
    title: "Gas Safety Act 1997 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/gas-safety-act-1997",
    section: "Gas Safety Act 1997 (Vic)",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["gas", "energy safe", "esv"],
    excerpt: "The Gas Safety Act 1997 (Vic) covers gas safety. Energy Safe Victoria is the public authority for guidance. This note does not describe a clearance or an appliance rule."
  },
  {
    id: "esv",
    title: "Energy Safe Victoria",
    url: "https://www.energysafe.vic.gov.au/",
    section: "Energy Safe Victoria public guidance",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["energy safe", "esv", "gas", "electricity"],
    excerpt: "Energy Safe Victoria is the Victorian safety regulator for electricity and gas. Its website is the public source for current guidance."
  },
  {
    id: "water",
    title: "Water Act 1989 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/water-act-1989",
    section: "Water Act 1989 (Vic). Backflow requirements are set by the relevant water corporation.",
    classes: ["2", "5", "6", "7", "8", "9"],
    topics: ["water", "backflow", "water corporation"],
    excerpt: "The Water Act 1989 (Vic) is the main Victorian water Act. Backflow prevention for a property is set by the water corporation that supplies it, under its own public rules. This note does not name a device or a test interval."
  },
  {
    id: "frv",
    title: "Fire Rescue Victoria",
    url: "https://www.frv.vic.gov.au/",
    section: "Fire Rescue Victoria public information",
    classes: ["2", "5", "6", "7", "8", "9"],
    topics: ["fire rescue", "frv", "fire brigade", "metropolitan"],
    excerpt: "Fire Rescue Victoria serves metropolitan Melbourne. Its site has public information about fire safety. Which service attends a building depends on where the building is."
  },
  {
    id: "cfa",
    title: "Country Fire Authority",
    url: "https://www.cfa.vic.gov.au/",
    section: "Country Fire Authority public information",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["cfa", "country fire", "regional fire"],
    excerpt: "The Country Fire Authority covers country Victoria. Its site has public fire-safety information. Which service attends depends on the location."
  },
  {
    id: "access",
    title: "Disability (Access to Premises — Buildings) Standards",
    url: "https://www.legislation.gov.au/F2010L00668/latest/text",
    section: "Disability (Access to Premises — Buildings) Standards 2010 (Cth)",
    classes: ["2", "5", "6", "7", "8", "9"],
    topics: ["access", "disability", "premises standards", "ramp"],
    excerpt: "The Disability (Access to Premises — Buildings) Standards 2010 are Commonwealth standards about access to buildings. They are called up through the building rules. This note points to the Standards. It does not state a width or a gradient."
  },
  {
    id: "planning",
    title: "Planning and Environment Act 1987 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/planning-and-environment-act-1987",
    section: "Planning and Environment Act 1987 (Vic)",
    classes: ["1", "2", "5", "6", "7", "8", "9"],
    topics: ["planning", "permit", "zone", "use"],
    excerpt: "The Planning and Environment Act 1987 (Vic) is the Act for planning schemes and planning permits. What a site can be used for is in the local planning scheme. This note does not say whether a use is permitted."
  },
  {
    id: "rta",
    title: "Residential Tenancies Act 1997 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/residential-tenancies-act-1997",
    section: "Residential Tenancies Act 1997 (Vic)",
    classes: ["1", "2"],
    topics: ["tenancy", "rental", "residential tenancies", "rent"],
    excerpt: "The Residential Tenancies Act 1997 (Vic) covers residential tenancies. It is the Act a property manager usually needs for a home that is rented. It is not the Act for a retail shop lease."
  },
  {
    id: "fences",
    title: "Fences Act 1968 (Vic)",
    url: "https://www.legislation.vic.gov.au/in-force/acts/fences-act-1968",
    section: "Fences Act 1968 (Vic). Victoria does not have a separate Dividing Fences Act.",
    classes: ["1"],
    topics: ["fence", "dividing fence", "boundary"],
    excerpt: "In Victoria, dividing fences are dealt with by the Fences Act 1968. There is no Victorian Act named the Dividing Fences Act. Read the Fences Act for a boundary fence between homes."
  }
];

export function ensureSources(db) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM regulation_sources").get().n;
  if (count > 0) return;
  const insert = db.prepare(`INSERT INTO regulation_sources
    (id, title, url, section, excerpt, classes, topics, last_checked, reviewed, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`);
  for (const source of SOURCES) {
    insert.run(source.id, source.title, source.url, source.section, source.excerpt, JSON.stringify(source.classes), JSON.stringify(source.topics), CHECKED, CHECKED);
  }
}

export function classesForUse(use) {
  return CLASSES[use] || [];
}

export function searchSources(db, query, buildingClass = "") {
  const words = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2);
  const rows = db.prepare("SELECT * FROM regulation_sources").all();
  const ranked = rows.map(row => {
    const classes = JSON.parse(row.classes || "[]");
    const topics = JSON.parse(row.topics || "[]");
    const hay = (row.title + " " + row.section + " " + row.excerpt + " " + topics.join(" ")).toLowerCase();
    const score = words.reduce((sum, word) => sum + (hay.includes(word) ? 1 : 0), 0);
    const classOk = !buildingClass || classes.includes(String(buildingClass)) || classes.includes("all");
    return { row, score, classOk, classes, topics };
  }).filter(item => item.score > 0 && item.classOk).sort((a, b) => b.score - a.score).slice(0, 3);
  return ranked.map(item => ({
    id: item.row.id,
    title: item.row.title,
    url: item.row.url,
    section: item.row.section,
    excerpt: item.row.excerpt,
    classes: item.classes,
    topics: item.topics,
    lastChecked: item.row.last_checked
  }));
}

export function citedAnswer(sources) {
  if (!sources.length) {
    return {
      text: "I could not find a stored official source for that. I will not guess a rule. Check the Victorian Building Authority (https://www.vba.vic.gov.au/) or the Victorian legislation site (https://www.legislation.vic.gov.au/).",
      citations: [],
      disclaimer: DISCLAIMER,
      sourced: false
    };
  }
  const text = sources.map(source => `${source.excerpt}\nSource: ${source.title}, ${source.section}. ${source.url} Last checked ${source.lastChecked}.`).join("\n\n");
  return {
    text,
    citations: sources.map(source => ({ title: source.title, url: source.url, section: source.section, lastChecked: source.lastChecked })),
    disclaimer: DISCLAIMER,
    sourced: true
  };
}

export function sourceNeedsReview(lastChecked, today = new Date()) {
  const then = Date.parse(lastChecked + "T00:00:00Z");
  if (!Number.isFinite(then)) return true;
  return today.getTime() - then > 183 * 24 * 3600 * 1000;
}

export function newSourceId() {
  return newId();
}
