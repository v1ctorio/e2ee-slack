const {SELF_BASE_URL} = process.env;

export function videoEmbedBlock(page_title: string, slug: string) {
  console.log("generating video embed:", SELF_BASE_URL + "/slug/" + slug);
  return {
    type: "video",
    alt_text: "embedded e2ee client",
    title: {
      type: "plain_text",
      text: "E2EE Slack - " + page_title,
    },
    thumbnail_url: "https://http.cat/200", // TODO change this with an actual thumbnail
    video_url: SELF_BASE_URL + "/slug/" + slug,
  };
}

export const getTimestamp = () => Math.floor(Date.now() / 1000);
