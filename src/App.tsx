import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkEmoji from "remark-emoji";
import remarkBreaks from "remark-breaks";
import remarkMention from "./plugins/remark-mention";
// import remarkNewlines from "remark-new-lines";
import remarkPing from "./plugins/remark-ping";

console.clear();
export default function App() {
  const markdown = `
  <div class="note">
Some *emphasis* and <strong>strong</strong>!

</div>

# Welcome to React Showdown :+1:

mustafa.serpek@turkcell.com.tr \n\r
https://codesandbox.io/s/throbbing-bird-u7k0em?file=/src/App.tsx\n
To get started, edit the markdown in \`example/src/App.tsx\`.


~~**asdasd**~~
***bold-italic** italic*


hello there @tivie

[**@wooorm**](https://github.com/wooorm)

*emphasis*

**emphasis**

_emphasis_

__emphasis__

emphasis

~strikethrough~
`;

  return (
    <div>
      <ReactMarkdown
        children={markdown}
        rawSourcePos={true}
        remarkPlugins={[
          [remarkGfm],
          [remarkParse],
          [rehypeStringify],
          [remarkRehype],
          [remarkEmoji],
          [remarkBreaks],
          [
            remarkMention,
            {
              buildUrl(values: any, defaultBuildUrl: any) {
                console.log("values: ", values);
                return values.type === "mention"
                  ? false
                  : defaultBuildUrl(values);
              }
            }
          ],
          [
            remarkPing,
            {
              pingUsername: () => true,
              userURL: (username: string) =>
                `https://your.website.com/path/to/${username}`,
              usernameRegex: /[\s'"(,:<]?@(\w+)/
            }
          ]
          /*[
            remarkPing,
            {
              pingUsername: () => false,
              userURL: (username: string) =>
                `https://your.website.com/path/to/${username}`
            }
          ]*/
        ]}
      />
    </div>
  );
}
