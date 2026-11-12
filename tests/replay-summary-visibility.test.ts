import test from "node:test";
import assert from "node:assert/strict";
import {replaySummaryForView} from "../src/lib/replay-summary-visibility";

test("student preview only shows published summaries while the teacher retains drafts",()=>{
 const draft={status:"draft",document:{title:"Private draft"}},published={status:"published",document:{title:"Published"}};
 assert.equal(replaySummaryForView(draft,true),null);
 assert.equal(replaySummaryForView(draft,false),draft);
 assert.equal(replaySummaryForView(published,true),published);
 assert.equal(replaySummaryForView(null,true),null);
});
