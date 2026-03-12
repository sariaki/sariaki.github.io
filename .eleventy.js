import markdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginRss from "@11ty/eleventy-plugin-rss";

export default function (eleventyConfig) {
    eleventyConfig.addGlobalData("currentYear", () => {
        return new Date().getFullYear();
    });

    eleventyConfig.addCollection("post", function(collectionApi) {
        return collectionApi.getFilteredByTag("post").filter(item => {
            return !item.filePathStem.includes("/todo/");
        }).sort((a, b) => {
            // Subtract to sort by timestamp
            return b.date - a.date; // descending
        });
    });

    const md = markdownIt({
        html: true,
        breaks: false,
        linkify: true
    });
    md.core.ruler.push("normalise_blank_lines", function (state) {
        state.src = state.src.replace(/\r\n/g, "\n");
        state.src = state.src.replace(/\n{3,}/g, "\n\n");
        state.src = state.src.replace(/\n\n[ \t]+/g, "\n\n");
    });

    eleventyConfig.setLibrary("md", md.use(markdownItFootnote));
    
    eleventyConfig.addPassthroughCopy("src/posts/img");
    eleventyConfig.addPassthroughCopy("src/posts/stylesheets");
    eleventyConfig.addPlugin(syntaxHighlight);
    eleventyConfig.addPlugin(pluginRss);

    return {
        dir: {
            input: "src",
            output: "public",
        },
    };
};