
---

## `src/mini-didact.js`

```js
// mini-didact.js
//
// Tiny React-like renderer with function components + useState.
// Inspired by Didact, but reimplemented and commented in my own words.
//
// Public API:
//   - createElement(type, props, ...children)
//   - render(element, container)
//   - useState(initial)

/* -------------------------------------------------------------------------- */
/*  Element creation                                                          */
/* -------------------------------------------------------------------------- */

export function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...(props || {}),
      children: children
        .flat()
        .map((child) =>
          typeof child === "object" ? child : createTextElement(child)
        ),
    },
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: String(text),
      children: [],
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Globals for fiber work loop                                               */
/* -------------------------------------------------------------------------- */

let nextUnitOfWork = null;
let wipRoot = null;
let currentRoot = null;
let deletions = null;
let wipFiber = null;
let hookIndex = 0;

/* -------------------------------------------------------------------------- */
/*  Render entrypoint                                                         */
/* -------------------------------------------------------------------------- */

export function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    parent: null,
    child: null,
    sibling: null,
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

/* -------------------------------------------------------------------------- */
/*  Work loop with requestIdleCallback                                       */
/* -------------------------------------------------------------------------- */

function workLoop(deadline) {
  let shouldYield = false;

  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

requestIdleCallback(workLoop);

/* -------------------------------------------------------------------------- */
/*  Commit phase                                                              */
/* -------------------------------------------------------------------------- */

function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) return;

  // Find parent with a real DOM node
  let domParentFiber = fiber.parent;
  while (domParentFiber && !domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber?.dom;
  if (!domParent) return;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    removeDom(fiber, domParent);
    return;
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function removeDom(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else if (fiber.child) {
    // If this fiber doesn't have a dom node, its children might.
    removeDom(fiber.child, domParent);
  }
}

/* -------------------------------------------------------------------------- */
/*  DOM update utility                                                        */
/* -------------------------------------------------------------------------- */

const isEvent = (key) => key.startsWith("on");
const isProperty = (key) => key !== "children" && !isEvent(key);
const isNew = (prev, next) => (key) => prev[key] !== next[key];
const isGone = (prev, next) => (key) => !(key in next);

function updateDom(dom, prevProps, nextProps) {
  // Remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // Remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = "";
    });

  // Add new or changed properties
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // Add new event listeners
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

/* -------------------------------------------------------------------------- */
/*  Perform unit of work                                                      */
/* -------------------------------------------------------------------------- */

function performUnitOfWork(fiber) {
  const isFunctionComponent = typeof fiber.type === "function";

  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // Return next unit of work: child → sibling → uncle
  if (fiber.child) return fiber.child;
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) return nextFiber.sibling;
    nextFiber = nextFiber.parent;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Function components + hooks                                               */
/* -------------------------------------------------------------------------- */

function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];

  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

export function useState(initial) {
  const oldFiber = wipFiber.alternate;
  const oldHook =
    oldFiber && oldFiber.hooks && oldFiber.hooks[hookIndex];

  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  if (oldHook) {
    // Apply queued updates
    oldHook.queue.forEach((updateFn) => {
      hook.state = updateFn(hook.state);
    });
  }

  const setState = (update) => {
    const updateFn =
      typeof update === "function" ? update : () => update;
    hook.queue.push(updateFn);

    // Trigger rerender
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot,
      parent: null,
      child: null,
      sibling: null,
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

/* -------------------------------------------------------------------------- */
/*  Host components (normal DOM nodes)                                        */
/* -------------------------------------------------------------------------- */

function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children || []);
}

function createDom(fiber) {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);
  return dom;
}

/* -------------------------------------------------------------------------- */
/*  Reconciliation                                                            */
/* -------------------------------------------------------------------------- */

function reconcileChildren(wipFiber, elements) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    const sameType =
      oldFiber && element && element.type === oldFiber.type;

    if (sameType) {
      // Update existing node
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        child: null,
        sibling: null,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }

    if (element && !sameType) {
      // Add new node
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        child: null,
        sibling: null,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }

    if (oldFiber && !sameType) {
      // Remove old node
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (prevSibling && newFiber) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}
