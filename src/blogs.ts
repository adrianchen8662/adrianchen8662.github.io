// The blogs in the Blogs menu. Each blog's posts live in _posts/<id>/.
export interface Blog {
  /** Folder under _posts/ */
  id: string;
  /** The blog's address, /<slug>/: its full name, so a link says what it leads to */
  slug: string;
  /** Addresses the blog used before; they redirect to the current one */
  formerSlugs?: string[];
  /** Name in the Blogs menu and the footer */
  name: string;
  /** Heading on the blog's page */
  title: string;
  /** Intro under the heading; may contain links */
  description: string;
}

export const BLOGS: Blog[] = [
  {
    id: 'bits-and-doohickeys',
    slug: 'bits-and-doohickeys',
    name: 'Bits & Doohickeys',
    title: 'Bits & Doohickeys',
    description: "Software and hardware I've built, taken apart, measured and tinkered with.",
  },
  {
    id: 'cs632',
    slug: 'njit-cs-632-advanced-database-system-design',
    formerSlugs: ['cs632'],
    name: 'NJIT CS 632',
    title: 'CS 632: Advanced Database System Design',
    description: 'Blog posts for CS 632, Advanced Database System Design, at NJIT.',
  },
  {
    id: 'ece49595',
    slug: 'purdue-ece-49595-open-source-software-senior-design-projects',
    formerSlugs: ['final-project'],
    name: 'Purdue ECE 49595',
    title: 'ECE 49595: Open Source Software Senior Design Projects',
    description:
      'Blog posts for ECE 49595, Open Source Software Senior Design Projects, at Purdue: progress and explanations for Argus. You can find it hosted <a href="https://github.com/adrianchen8662/argus" target="_blank">on Github</a>. Track our progress <a href="https://github.com/users/adrianchen8662/projects/2/views/1" target="_blank">here</a>.',
  },
];

export const blogUrl = (blog: Blog) => `/${blog.slug}/`;
