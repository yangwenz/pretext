## Personal Thoughts, In No Particular Order

- My personal desire is to see end-developers empowered to make layouts that make UI more expressive, without sacrificing maintainability & performance or waiting for permission from the web committee. The current UI stereotypes across all platforms have been one of:
  - a landing-page with few, floating text chunks, powered by GL
  - a blog article with mostly just text and no possible interactivity
  - a SaaS dashboard
  - a mobile UI with 2-3 rectangles' worth of UI

- If you dig deep enough, 80% of CSS spec could be avoided if userland had better control over text. Web layout shoves text into a single-direction black hole, and crawling those metrics back out incurs huge maintenance and performance overhead.

- The convenience angle of CSS is gradually being eroded: more expressivity tends to mean worse performance and more "programming" in a language few people want to program in. AI also reduces the value of hard-coded CSS configs that are more dictionary-like than compositional.

- New competing browser implementations are very hard because the specs are gigantic. Engines chase architectural and performance improvements before discovering that decades of spec obligations throw a wrench in them. As a first approximation, UI performance & developer ergonomics _cannot_ improve by an order of magnitude while the specs are the bottleneck. Bringing more capabilities to userland might at least stop that complexity from growing; every browser vendor can agree on that, sometimes for completely opposing reasons.

- The cost of any verifiable software will trend toward 0
