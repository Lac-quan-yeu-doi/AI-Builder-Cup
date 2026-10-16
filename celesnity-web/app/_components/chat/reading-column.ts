/**
 * How wide one line of the transcript is allowed to run.
 *
 * The transcript, the composer under it and the landing screen above it are one
 * column, and they used to disagree: the scroller said 960px, the assistant's
 * own prose said `max-w-[56rem]` (896px), and the landing said 700px, so the
 * composer moved sideways the moment a conversation started.
 *
 * `max-w-3xl` is 768px — the thread width ChatGPT's web app settles on at
 * desktop widths, and the one this product is styled after. At 14px that is
 * about 105 characters a line: wide enough that a reply with a table or a
 * list of numbers is not squeezed into extra lines, still narrow enough to
 * track back to the start of the next line. The earlier 672px (`max-w-2xl`)
 * read as cramped next to it.
 */
export const READING_COLUMN = 'mx-auto w-full max-w-3xl';
