import $ from 'jquery';
import Collapse from 'bootstrap/js/dist/collapse';
import Dropdown from 'bootstrap/js/dist/dropdown';
import Modal from 'bootstrap/js/dist/modal';
import Tab from 'bootstrap/js/dist/tab';
import Tooltip from 'bootstrap/js/dist/tooltip';
import Popover from 'bootstrap/js/dist/popover';

const COMPONENTS = {
  dropdown: { ctor: Dropdown },
  collapse: { ctor: Collapse, defaultMethod: 'toggle', optionFlag: 'toggle' },
  modal: { ctor: Modal, defaultMethod: 'show', optionFlag: 'show' },
  tab: { ctor: Tab, defaultMethod: 'show' },
  tooltip: { ctor: Tooltip },
  popover: { ctor: Popover },
};

const LEGACY_DATA_ATTRS = [
  ['toggle', 'bs-toggle'],
  ['target', 'bs-target'],
  ['dismiss', 'bs-dismiss'],
  ['parent', 'bs-parent'],
  ['placement', 'bs-placement'],
  ['container', 'bs-container'],
  ['trigger', 'bs-trigger'],
  ['offset', 'bs-offset'],
  ['title', 'bs-title'],
  ['content', 'bs-content'],
  ['spy', 'bs-spy'],
];

const convertElementAttributes = element => {
  LEGACY_DATA_ATTRS.forEach(([legacy, modern]) => {
    const legacyAttr = `data-${legacy}`;
    const modernAttr = `data-${modern}`;
    if (element.hasAttribute && element.hasAttribute(legacyAttr) && !element.hasAttribute(modernAttr)) {
      element.setAttribute(modernAttr, element.getAttribute(legacyAttr));
    }
  });
};

export const upgradeLegacyDataAttributes = root => {
  if (typeof document === 'undefined') {
    return;
  }
  const target = root || document;
  if (target.querySelectorAll) {
    const selector = LEGACY_DATA_ATTRS.map(([legacy]) => `[data-${legacy}]`).join(',');
    if (selector) {
      target.querySelectorAll(selector).forEach(convertElementAttributes);
    }
  }
  if (target.nodeType === 1) {
    convertElementAttributes(target);
  }
};

const bootstrapAlreadyLoaded =
  typeof window !== 'undefined' && window.__CSC_BOOTSTRAP5_COMPAT_LOADED__;

if (!bootstrapAlreadyLoaded) {
  if (typeof window !== 'undefined') {
    window.__CSC_BOOTSTRAP5_COMPAT_LOADED__ = true;
    window.bootstrap = window.bootstrap || {
      Dropdown,
      Collapse,
      Modal,
      Tab,
      Tooltip,
      Popover,
    };
  }

  const registerLegacyPlugin = (name, descriptor) => {
    const Component = descriptor.ctor;
    const plugin = function (option, ...args) {
      return this.each(function () {
        const element = this;
        const isCommand = typeof option === 'string';
        const configObject = !isCommand && typeof option === 'object' ? option : undefined;
        let instance = Component.getInstance(element);
        if (!instance) {
          instance = Component.getOrCreateInstance(element, configObject);
        } else if (configObject) {
          instance = Component.getOrCreateInstance(element, configObject);
        }
        if (isCommand) {
          if (typeof instance[option] === 'function') {
            instance[option](...args);
          }
          return;
        }

        const defaultMethod = descriptor.defaultMethod;
        if (!defaultMethod || typeof instance[defaultMethod] !== 'function') {
          return;
        }

        const optionFlag = descriptor.optionFlag;
        const shouldInvoke =
          !configObject ||
          !optionFlag ||
          configObject[optionFlag] === undefined ||
          configObject[optionFlag];

        if (shouldInvoke) {
          instance[defaultMethod](...args);
        }
      });
    };

    $.fn[name] = plugin;
    $.fn[name].Constructor = Component;
    if (Component.Default && !Component.DEFAULTS) {
      Component.DEFAULTS = Component.Default;
    }
  };

  Object.entries(COMPONENTS).forEach(([name, descriptor]) => {
    registerLegacyPlugin(name, descriptor);
  });

  if (typeof document !== 'undefined') {
    upgradeLegacyDataAttributes(document);
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              upgradeLegacyDataAttributes(node);
            }
          });
        });
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }
}
