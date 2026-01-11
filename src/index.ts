import type { Element, Root, RootContent } from "hast";
import type { Plugin, Transformer } from "unified";
import GitHubSlugger from "github-slugger";
import { fromHtml } from "hast-util-from-html";
import { h } from "hastscript";
import { isNonEmptyArray } from "@robot-inventor/ts-utils";
import { toHtml } from "hast-util-to-html";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import { visitParents } from "unist-util-visit-parents";

/**
 * Custom TOC template function.
 * @param html HTML content of the TOC list
 * @returns Wrapped HTML content
 */
type RehypeCustomTocTemplate = (html: string) => string;

/**
 * Options for the rehypeCustomToc plugin.
 */
interface RehypeCustomTocOptions {
    /**
     * A function that takes the generated HTML and returns the final HTML.
     * This can be used to wrap the generated HTML in a custom template.
     * @default
     * ```javascript
     * const defaultTemplate = (html) => {
     *     return `
     * <aside class="toc">
     *     <h2>Contents</h2>
     *     <nav>
     *         ${html}
     *     </nav>
     * </aside>`.trim();
     * };
     * ```
     */
    template?: RehypeCustomTocTemplate;
    /**
     * The maximum depth of headings to include in the table of contents.
     * @default 3
     */
    maxDepth?: number;
    /**
     * Whether to use an ordered list (`<ol>`) or an unordered list (`<ul>`).
     * @default false
     */
    ordered?: boolean;
}

/**
 * Default TOC template function for {@link RehypeCustomTocTemplate}.
 * @param html HTML content of the TOC list
 * @returns Wrapped HTML content
 */
const defaultTemplate: RehypeCustomTocTemplate = (html: string): string =>
    `
<aside class="toc">
    <h2>Contents</h2>
    <nav>
        ${html}
    </nav>
</aside>`.trim();

/**
 * Default options for the rehypeCustomToc plugin.
 */
const DEFAULT_OPTIONS = {
    maxDepth: 3,
    ordered: false,
    template: defaultTemplate
} as const satisfies Required<RehypeCustomTocOptions>;

/**
 * Generate the table of contents from the headings data.
 * @param tree The HAST tree
 * @param options Options for the plugin
 * @returns The generated table of contents
 */
// eslint-disable-next-line max-statements, max-lines-per-function
const generateToc = (tree: Root, options: Required<RehypeCustomTocOptions>): RootContent[] => {
    const toc: Element = {
        children: [],
        properties: {},
        tagName: options.ordered ? "ol" : "ul",
        type: "element"
    } as const;

    const headings: Array<{ depth: number; slug: string; text: string }> = [];
    const slugger = new GitHubSlugger();
    visit(tree, "element", (node) => {
        if (!["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.tagName)) return;

        const text = toText(node).trim();
        const slug = (node.properties["id"] as string) || slugger.slug(text);
        node.properties["id"] = slug;
        // eslint-disable-next-line no-magic-numbers
        const depth = parseInt(node.tagName.slice(1), 10);
        headings.push({
            depth,
            slug,
            text
        });
    });

    if (!isNonEmptyArray(headings)) return [];

    let currentDepth = headings[0].depth;
    let currentParent = toc;
    const parents: Element[] = [toc];

    for (const heading of headings) {
        // eslint-disable-next-line no-continue
        if (heading.depth > options.maxDepth) continue;

        const li = h("li", h("a", { href: `#${heading.slug}` }, heading.text));

        if (heading.depth === currentDepth) {
            // The current heading is at the same level as the previous one.
            currentParent.children.push(li);
            currentDepth = heading.depth;
        } else if (heading.depth > currentDepth) {
            // The current heading is at a deeper level than the previous one.
            const ul = h(options.ordered ? "ol" : "ul", li);
            currentParent.children.push(ul);

            currentParent = ul;
            parents.push(currentParent);
            currentDepth = heading.depth;
        } else {
            // The current heading is at a shallower level than the previous one.
            // eslint-disable-next-line id-length
            for (let i = 0; i < currentDepth - heading.depth; i++) {
                parents.pop();
                // eslint-disable-next-line no-magic-numbers
                const parentNode = parents[parents.length - 1];
                if (!parentNode) {
                    throw new Error("Parent node not found. Make sure the headings are sorted by depth.");
                }

                currentParent = parentNode;
            }

            currentParent.children.push(li);
            currentDepth = heading.depth;
        }
    }

    return fromHtml(options.template(toHtml(toc)), { fragment: true }).children;
};

/**
 * Rehype plugin to generate a table of contents.
 * @param userOptions Options for the plugin
 * @returns The plugin
 */
const rehypeCustomToc: Plugin<[RehypeCustomTocOptions], Root> = (userOptions: RehypeCustomTocOptions) => {
    const options = { ...DEFAULT_OPTIONS, ...userOptions };

    /**
     * The transformer function for the plugin.
     * @param tree The HAST tree
     */
    const transformer: Transformer<Root> = (tree: Root) => {
        const tocNodes = generateToc(tree, options);
        let tocInserted = false;

        visitParents(tree, "comment", (node, ancestors) => {
            if (node.value.trim().toLowerCase() !== "toc") return;

            // eslint-disable-next-line no-magic-numbers, @typescript-eslint/no-non-null-assertion
            const parent = ancestors.at(-1)!;
            const index = parent.children.indexOf(node);

            // eslint-disable-next-line no-magic-numbers
            if (parent.type === "element" && parent.tagName === "p" && parent.children.length === 1) {
                // eslint-disable-next-line no-magic-numbers, @typescript-eslint/no-non-null-assertion
                const grand = ancestors.at(-2)!;
                const parentIdx = grand.children.indexOf(parent);
                // eslint-disable-next-line no-magic-numbers
                grand.children.splice(parentIdx, 1, ...tocNodes);
            } else {
                // eslint-disable-next-line no-magic-numbers
                parent.children.splice(index, 1, ...tocNodes);
            }
            tocInserted = true;
        });

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!tocInserted) {
            tree.children.unshift(...tocNodes);
        }
    };

    return transformer;
};

export default rehypeCustomToc;
export type { RehypeCustomTocOptions, RehypeCustomTocTemplate };
