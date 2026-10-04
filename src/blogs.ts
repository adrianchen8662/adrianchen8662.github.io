// The blogs in the Blogs menu. Each blog's posts live in _posts/<id>/.
export interface Blog {
  /** Folder under _posts/, and the blog's address: /<id>/ */
  id: string;
  /** Name in the Blogs menu and the footer */
  name: string;
  /** Heading on the blog's page */
  title: string;
  /** Intro under the heading; may contain links */
  description: string;
}

export const BLOGS: Blog[] = [
  {
    id: 'final-project',
    name: 'ECE Final Project',
    title: 'Final Project',
    description:
      'Blog posts and such for progress and explanations for Argus. You can find it hosted <a href="https://github.com/adrianchen8662/argus" target="_blank">on Github</a>. Track our progress <a href="https://github.com/users/adrianchen8662/projects/2/views/1" target="_blank">here</a>.',
  },
];
