#let celesnityReport(body) = {
  set page(
    paper: "a4",
    margin: (x: 20mm, y: 22mm),
    header: context align(right)[#text(size: 8pt, fill: rgb("#1B3A6B"))[CELESNITY / AURORA]],
    footer: context align(center)[#text(size: 8pt, fill: rgb("#687080"))[#counter(page).display("1")]],
  )
  set text(font: "Libertinus Serif", size: 10pt, fill: rgb("#15181F"))
  set par(leading: 0.68em)
  set table(
    stroke: 0.5pt + rgb("#D9DEE8"),
    inset: 7pt,
    fill: (_, y) => if y == 0 { rgb("#1B3A6B") } else { white },
  )
  show table.cell.where(y: 0): set text(weight: "bold", fill: white)
  show heading.where(level: 1): it => {
    set text(size: 21pt, weight: "bold", fill: white)
    block(fill: rgb("#0B1020"), inset: (x: 12pt, y: 9pt), above: 1.1em, below: 0.55em, it)
  }
  show heading.where(level: 2): it => {
    set text(size: 15pt, weight: "bold", fill: rgb("#2D44E0"))
    block(above: 0.9em, below: 0.4em, it)
  }
  show figure.caption: set text(size: 8pt, fill: rgb("#687080"))
  body
}
