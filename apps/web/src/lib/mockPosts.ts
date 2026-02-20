import type { Post } from "@/components/PostCard";

/**
 * Sample posts shown to unauthenticated visitors.
 * Data sourced from mock_data.json (Chris Williamson newsletter).
 */
export const MOCK_POSTS: Post[] = [
    {
        id: "monk-mode-dark-side",
        post_type: "carousel",
        topic: "NICHE",
        title: "Dark Side Of Monk Mode",
        slides: [
            {
                slide_number: 1,
                type: "hook",
                text: "**Monk Mode can make you better — and quietly ruin your life.**\nWhy the retreat that improves you can also stop you from ever showing up.",
            },
            {
                slide_number: 2,
                type: "body",
                text: "**What is Monk Mode?**\nA temporary retreat to focus on the 3 I's: **Introspection, Isolation, Improvement.**\nPeople use it to eliminate distractions and work on themselves full-time.",
            },
            {
                slide_number: 3,
                type: "body",
                text: "**It's not new.**\nIllimitable Man described it in 2014 as a deliberate cut-off from the world to recalibrate focus — and warned it can become a serious commitment.",
            },
            {
                slide_number: 4,
                type: "body",
                text: "A personal datapoint:\nI've done full Monk Mode across 2017–2021.\n**2000+ days** no alcohol, **500 days** no caffeine, **1500+** meditation sessions — mostly alone in a bedroom in Newcastle upon Tyne.",
            },
            {
                slide_number: 5,
                type: "body",
                text: "The problem: Monk Mode feels noble.\nIt **justifies retreat** from risk, adventure and friendship under the banner of self-improvement.\nThat justification is how it becomes sticky — and then permanent.",
            },
            {
                slide_number: 6,
                type: "body",
                text: "Example: a friend prepped for a fitness show — introverted, socially shy — used the competition to justify militant isolation.\nThe show passed. The routine didn't. It took years to rebuild his social life.",
            },
            {
                slide_number: 7,
                type: "body",
                text: "Key idea: **Private practice is for public performance.**\nDo your work in solitude so you can better **show up** in the world — not to replace showing up altogether.\nBill Perkins: \u201Cdelayed gratification in the extreme results in no gratification.\u201D",
            },
            {
                slide_number: 8,
                type: "closer",
                text: "**How to avoid the trap:** Periodise your Monk Mode.\nSet an end date. **3–6 months** is a sweet spot (longer if you've never done it before).\nUse solitude to train — then return and perform.",
            },
        ],
        date: "Feb 20, 2026",
    },
    {
        id: "sleep-calibration",
        post_type: "carousel",
        topic: "TRIVIA",
        title: "Sleep Calibration",
        slides: [
            {
                slide_number: 1,
                type: "hook",
                text: "**If you sleep 6 hours, you're performing like someone awake 24 hours — but you probably won't feel it.**",
            },
            {
                slide_number: 2,
                type: "body",
                text: "A landmark sleep test put people on **4h, 6h, or 8h** per night for **14 days**.\nCognitive performance was measured every two hours.",
            },
            {
                slide_number: 3,
                type: "body",
                text: "By day 14 the results were stark:\n**6 hours/night = same impairment as 24 hours awake.**\n**4 hours/night = same as 48 hours awake.**",
            },
            {
                slide_number: 4,
                type: "body",
                text: "From day 3–4 people stopped feeling subjectively more tired — but their reaction times, attention and working memory continued to decline.\nYour brain hides the decline.",
            },
            {
                slide_number: 5,
                type: "body",
                text: "Most adults need **7–9 hours**.\nSaying \u201CI only need 6\u201D usually means **you forgot what normal feels like.**\nFeeling fine ≠ functioning well. (h/t Aakash Gupta)",
            },
            {
                slide_number: 6,
                type: "closer",
                text: "**Action:** Recalibrate for two weeks: aim for 7–9h and compare performance.\nIf you're on 6h and think you're OK — assume you've lost calibration until proven otherwise.\nSave this post for when you cut corners on sleep.",
            },
        ],
        date: "Feb 20, 2026",
    },
    {
        id: "courage-quote",
        post_type: "single",
        topic: "NICHE",
        title: "Courage",
        slides: [
            {
                slide_number: 1,
                type: "standalone",
                text: "**\u201CLife shrinks or expands according to one's courage.\u201D — Anaïs Nin**\nFounders: the scale of what you get is set by the size of the risks you'll take.",
            },
        ],
        date: "Feb 20, 2026",
    },
    {
        id: "simplicity-quote",
        post_type: "single",
        topic: "NICHE",
        title: "Simplicity",
        slides: [
            {
                slide_number: 1,
                type: "standalone",
                text: "**Your life does not need to be easier — it needs to be simpler.**\nYou can handle hard. You can't handle messy. Remove complexity before you ask for mercy.",
            },
        ],
        date: "Feb 20, 2026",
    },
    {
        id: "jet-lag-hack",
        post_type: "single",
        topic: "TRIVIA",
        title: "Jet Lag Hack",
        slides: [
            {
                slide_number: 1,
                type: "standalone",
                text: "**Jet lag only happens if you permit yourself to be time-cucked.**\nTry refusing to change timezones on short trips: stay on your home schedule.\nExample: Chris stayed on \u201CCWT\u201D (home time) while in Qatar — worked for 3 days.",
            },
        ],
        date: "Feb 20, 2026",
    },
];
