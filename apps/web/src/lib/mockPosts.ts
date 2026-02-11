import type { Post } from "@/components/PostCard";

/**
 * Sample posts shown to unauthenticated visitors.
 * These give a taste of the feed without requiring login.
 */
export const MOCK_POSTS: Post[] = [
    {
        id: "mock-1",
        topic: "BIOGRAPHY",
        title: "Steve Jobs' Reality Distortion Field",
        text_content:
            "Steve Jobs was famous for what colleagues called the \"Reality Distortion Field\" — his ability to convince almost anyone of practically anything. Bud Tribble first coined the term in 1981. Jobs used this force of will to push teams beyond what they thought possible, shipping products like the original Macintosh that changed computing forever.",
        date: "Feb 10, 2026",
    },
    {
        id: "mock-2",
        topic: "TRIVIA",
        title: "Honey Never Spoils",
        text_content:
            "Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still perfectly edible. Honey's low moisture content and acidic pH create an inhospitable environment for bacteria and microorganisms. Combined with the enzyme glucose oxidase which produces hydrogen peroxide, honey is essentially a self-preserving food.",
        date: "Feb 9, 2026",
    },
    {
        id: "mock-3",
        topic: "NICHE",
        title: "The Art of Mechanical Keyboards",
        text_content:
            "Mechanical keyboards have exploded in popularity since 2015. Unlike membrane keyboards, each key has its own individual switch — Cherry MX Blues for clicky feedback, Reds for smooth linear action, and Browns for a tactile bump without the click. Custom enthusiasts spend hundreds on artisan keycaps hand-sculpted from resin.",
        date: "Feb 8, 2026",
    },
    {
        id: "mock-4",
        topic: "AI",
        title: "How Transformers Changed Everything",
        text_content:
            "The 2017 paper \"Attention Is All You Need\" introduced the Transformer architecture, replacing recurrence with self-attention mechanisms. This single innovation enabled models like GPT, BERT, and their descendants to process language in parallel, dramatically improving both training speed and performance on virtually every NLP benchmark.",
        date: "Feb 7, 2026",
    },
    {
        id: "mock-5",
        topic: "Frontend",
        title: "Why React Server Components Matter",
        text_content:
            "React Server Components let you render parts of your UI on the server without sending their JavaScript to the client. This means faster page loads, smaller bundles, and direct access to backend resources — all while keeping the composability model React developers love.",
        date: "Feb 6, 2026",
    },
];
