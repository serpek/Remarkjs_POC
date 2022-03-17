/**
 * @typedef {import('mdast').Root} Root
 * @typedef {import('mdast').StaticPhrasingContent} StaticPhrasingContent
 * @typedef {import('mdast-util-find-and-replace').ReplaceFunction} ReplaceFunction
 * @typedef {{input: string, index: number}} Match
 *
 * @callback DefaultBuildUrl
 * @param {BuildUrlValues} values
 * @returns {string}
 *
 * @callback BuildUrl
 * @param {BuildUrlValues} values
 *   Info on the link to build.
 * @param {DefaultBuildUrl} defaultBuildUrl
 *   Function that can be called to perform normal behavior.
 * @returns {string|false}
 *
 * @typedef {BuildUrlCommitValues|BuildUrlCompareValues|BuildUrlIssueValues|BuildUrlMentionValues} BuildUrlValues
 *
 * @typedef BuildUrlCommitValues
 *   Arguments for buildUrl functions for commit hash
 * @property {'commit'} type The type of special object
 * @property {string} user The owner of the repo
 * @property {string} project The project of the repo
 * @property {string} hash The commit hash value
 *
 * @typedef BuildUrlCompareValues
 *   Arguments for buildUrl functions for commit hash ranges
 * @property {'compare'} type The type of special object
 * @property {string} user The owner of the repo
 * @property {string} project The project of the repo
 * @property {string} base The SHA of the range start
 * @property {string} compare The SHA of the range end
 *
 * @typedef BuildUrlIssueValues
 *   Arguments for buildUrl functions for issues
 * @property {'issue'} type The type of special object
 * @property {string} user The owner of the repo
 * @property {string} project The project of the repo
 * @property {string} no The parsed issue number
 *
 * @typedef BuildUrlMentionValues
 *   Arguments for buildUrl functions for mentions
 * @property {'mention'} type The type of special object
 * @property {string} user The parsed user name
 *
 * @typedef RepositoryInfo
 *   The owner and project of the repo
 * @property {string} user The user/organization name
 * @property {string} project The project/repo name
 *
 * @typedef Options
 *   Configuration.
 * @property {string} [repository]
 *   Repository to link against.
 *   Detected from the `repository` field in `package.json` if not given.
 *   Should point to a GitHub repository.
 * @property {boolean} [mentionStrong=true]
 *   Wrap mentions in `strong`.
 *   This makes them render more like how GitHub styles them.
 *   But GitHub itself uses CSS instead of strong.
 * @property {BuildUrl} [buildUrl]
 *   Change how (and whether) things are linked.
 */

import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import { findAndReplace } from "mdast-util-find-and-replace";

// Previously, GitHub linked `@mention` and `@mentions` to their blog post about
// mentions (<https://github.com/blog/821>).
// Since June 2019, and possibly earlier, they stopped linking those references.
const denyMention = new Set(["mention", "mentions"]);

// Constants.
const minShaLength = 7;

// Username may only contain alphanumeric characters or single hyphens, and
// cannot begin or end with a hyphen*.
//
// \* That is: until <https://github.com/remarkjs/remark-github/issues/13>.
const userGroup = "[\\da-z][-\\da-z]{0,38}";
const projectGroup = "(?:\\.git[\\w-]|\\.(?!git)|[\\w-])+";
const repoGroup = "(" + userGroup + ")\\/(" + projectGroup + ")";

const linkRegex = new RegExp(
  "^https?:\\/\\/github\\.com\\/" +
    repoGroup +
    "\\/(commit|compare|issues|pull)\\/([a-f\\d]+(?:\\.{3}[a-f\\d]+)?\\/?(?=[#?]|$))",
  "i"
);

const referenceRegex = new RegExp(
  "(" +
    userGroup +
    ")(?:\\/(" +
    projectGroup +
    "))?(?:#([1-9]\\d*)|@([a-f\\d]{7,40}))",
  "gi"
);

const mentionRegex = new RegExp(
  "@(" + userGroup + "(?:\\/" + userGroup + ")?)",
  "gi"
);

/**
 * Plugin to enable, disable, and ignore messages.
 *
 * @type {import('unified').Plugin<[Options?]|void[], Root>}
 */
export default function remarkGithub(options = {}) {
  return (tree) => {
    findAndReplace(
      tree,
      [
        [referenceRegex, replaceReference],
        [mentionRegex, replaceMention]
      ],
      { ignore: ["link", "linkReference"] }
    );

    visit(tree, "link", (node) => {
      const link = parse(node);
      if (!link) {
        return;
      }

      const comment = link.comment ? " (comment)" : "";
      /** @type {string} */
      let base;
      base = link.user;

      /** @type {StaticPhrasingContent[]} */
      const children = [];

      if (link.page === "issues" || link.page === "pull") {
        base += "#";
        children.push({
          type: "text",
          value: base + link.reference + comment
        });
      } else {
        if (base) {
          children.push({ type: "text", value: base + "@" });
        }

        children.push({ type: "inlineCode", value: link.reference });

        if (link.comment) {
          children.push({ type: "text", value: comment });
        }
      }

      node.children = children;
    });
  };

  /**
   * @param {BuildUrlValues} values
   * @returns {string|false}
   */
  function buildUrl(values) {
    if (options.buildUrl) return options.buildUrl(values, defaultBuildUrl);
    return defaultBuildUrl(values);
  }

  /**
   * @type {ReplaceFunction}
   * @param {string} value
   * @param {string} username
   * @param {Match} match
   */
  function replaceMention(value, username, match) {
    if (
      /[\w`]/.test(match.input.charAt(match.index - 1)) ||
      /[/\w`]/.test(match.input.charAt(match.index + value.length)) ||
      denyMention.has(username)
    ) {
      return false;
    }

    const url = buildUrl({ type: "mention", user: username });

    if (!url) return false;

    /** @type {StaticPhrasingContent} */
    let node = { type: "text", value };

    if (options.mentionStrong !== false) {
      node = { type: "strong", children: [node] };
    }

    return { type: "link", title: null, url, children: [node] };
  }

  /**
   * @type {ReplaceFunction}
   * @param {string} $0
   * @param {string} user
   * @param {string} specificProject
   * @param {string} no
   * @param {string} hash
   * @param {Match} match
   */
  // eslint-disable-next-line max-params
  function replaceReference($0, user, specificProject, no, hash, match) {
    if (
      /[^\t\n\r (@[{]/.test(match.input.charAt(match.index - 1)) ||
      /\w/.test(match.input.charAt(match.index + $0.length))
    ) {
      return false;
    }

    const project = specificProject;
    const url = no
      ? buildUrl({ type: "issue", user, project, no })
      : buildUrl({ type: "commit", user, project, hash });

    if (!url) return false;

    /** @type {StaticPhrasingContent[]} */
    const nodes = [];
    let value = "";

    if (no) {
      value += "#" + no;
    } else {
      value += "@";
      nodes.push({ type: "inlineCode", value: abbr(hash) });
    }

    nodes.unshift({ type: "text", value });

    return { type: "link", title: null, url, children: nodes };
  }
}

/**
 * Abbreviate a SHA.
 *
 * @param {string} sha
 * @returns {string}
 */
function abbr(sha) {
  return sha.slice(0, minShaLength);
}

/**
 * Given a set of values based on the values type, returns link URL.
 *
 * @type {DefaultBuildUrl}
 */
function defaultBuildUrl(values) {
  const base = "https://github.com";

  if (values.type === "mention") return [base, values.user].join("/");

  const { project, user } = values;

  if (values.type === "commit")
    return [base, user, project, "commit", values.hash].join("/");

  if (values.type === "issue")
    return [base, user, project, "issues", values.no].join("/");

  // `values.type` is `'compare'`
  return [
    base,
    user,
    project,
    "compare",
    values.base + "..." + values.compare
  ].join("/");
}

/**
 * Parse a link and determine whether it links to GitHub.
 *
 * @param {import('mdast').Link} node
 * @returns {{user: string, project: string, page: string, reference: string, comment: boolean}|undefined}
 */
function parse(node) {
  const url = node.url || "";
  const match = linkRegex.exec(url);

  if (
    // Not a proper URL.
    !match ||
    // Looks like formatting.
    node.children.length !== 1 ||
    node.children[0].type !== "text" ||
    toString(node) !== url ||
    // SHAs can be min 4, max 40 characters.
    (match[3] === "commit" && (match[4].length < 4 || match[4].length > 40)) ||
    // SHAs can be min 4, max 40 characters.
    (match[3] === "compare" &&
      !/^[a-f\d]{4,40}\.{3}[a-f\d]{4,40}$/.test(match[4])) ||
    // Issues / PRs are decimal only.
    ((match[3] === "issues" || match[3] === "pull") &&
      /[a-f]/i.test(match[4])) ||
    // Projects can be at most 99 characters.
    match[2].length >= 100
  ) {
    return;
  }

  let reference = match[4];

  if (match[3] === "compare") {
    const [base, compare] = reference.split("...");
    reference = abbr(base) + "..." + abbr(compare);
  } else {
    reference = abbr(reference);
  }

  return {
    user: match[1],
    project: match[2],
    page: match[3],
    reference,
    comment:
      url.charAt(match[0].length) === "#" && match[0].length + 1 < url.length
  };
}
