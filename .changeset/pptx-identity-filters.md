---
"@open-slide/core": patch
---

Keep text editable in the PPTX export when a filter draws nothing, such as the `blur(0px)` a blur-in animation settles on, and fold `opacity()` filters into the element's opacity.
