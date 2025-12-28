import $ from 'jquery';
import md5 from 'blueimp-md5';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { createLowlight, common } from 'lowlight';
import _escape from 'lodash-es/escape';
import _unescape from 'lodash-es/unescape';
import hljs from 'highlight.js';

import { getLocalStorageKey } from 'utils';

const STORAGE_PREFIX = 'ubereditor:';
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000;

const lowlightInstance = createLowlight(common);

const markdownParser = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
});
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  hr: '---',
});
turndown.use(gfm);

function hasLocalStorage() {
  try {
    return typeof window.localStorage !== 'undefined';
  } catch (err) {
    return false;
  }
}

function getPersistKey(textarea) {
  if (!textarea || !textarea.name) {
    return null;
  }
  return `${STORAGE_PREFIX}${getLocalStorageKey(textarea)}`;
}

function loadPersistedDraft(key) {
  if (!key || !hasLocalStorage()) {
    return null;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    const payload = JSON.parse(raw);
    return typeof payload.value === 'string' ? payload : null;
  } catch (err) {
    return null;
  }
}

function persistDraft(key, value) {
  if (!key || !hasLocalStorage()) {
    return;
  }
  const hash = md5((value || '').replace(/\s+/g, ''));
  const payload = JSON.stringify({
    value,
    hash,
    updatedAt: new Date().toISOString(),
  });
  window.localStorage.setItem(key, payload);
}

function removeDraft(key) {
  if (!key || !hasLocalStorage()) {
    return;
  }
  window.localStorage.removeItem(key);
}

function buildBlockSwitcher(editor) {
  const select = document.createElement('select');
  select.className = 'form-select form-select-sm ubereditor-block-switcher';
  const options = [
    { label: 'Paragraph', value: 'paragraph' },
    { label: 'Heading 2', value: 'h2', attrs: { level: 2 } },
    { label: 'Heading 3', value: 'h3', attrs: { level: 3 } },
    { label: 'Heading 4', value: 'h4', attrs: { level: 4 } },
  ];
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
  select.addEventListener('change', () => {
    const val = select.value;
    switch (val) {
      case 'h2':
        editor.chain().focus().setHeading({ level: 2 }).run();
        break;
      case 'h3':
        editor.chain().focus().setHeading({ level: 3 }).run();
        break;
      case 'h4':
        editor.chain().focus().setHeading({ level: 4 }).run();
        break;
      default:
        editor.chain().focus().setParagraph().run();
    }
  });
  return select;
}

const COMMANDS = [
  {
    name: 'bold',
    icon: 'fa-bold',
    title: 'Bold',
    run: editor => editor.chain().focus().toggleBold().run(),
    isActive: editor => editor.isActive('bold'),
    isEnabled: editor => editor.can().chain().focus().toggleBold().run(),
  },
  {
    name: 'italic',
    icon: 'fa-italic',
    title: 'Italic',
    run: editor => editor.chain().focus().toggleItalic().run(),
    isActive: editor => editor.isActive('italic'),
    isEnabled: editor => editor.can().chain().focus().toggleItalic().run(),
  },
  {
    name: 'underline',
    icon: 'fa-underline',
    title: 'Underline',
    run: editor => editor.chain().focus().toggleUnderline().run(),
    isActive: editor => editor.isActive('underline'),
    isEnabled: editor => editor.can().chain().focus().toggleUnderline().run(),
  },
  {
    name: 'strike',
    icon: 'fa-strikethrough',
    title: 'Strikethrough',
    run: editor => editor.chain().focus().toggleStrike().run(),
    isActive: editor => editor.isActive('strike'),
    isEnabled: editor => editor.can().chain().focus().toggleStrike().run(),
  },
  {
    name: 'code',
    icon: 'fa-code',
    title: 'Inline code',
    run: editor => editor.chain().focus().toggleCode().run(),
    isActive: editor => editor.isActive('code'),
    isEnabled: editor => editor.can().chain().focus().toggleCode().run(),
  },
  {
    name: 'bulletList',
    icon: 'fa-list-ul',
    title: 'Bullet list',
    run: editor => editor.chain().focus().toggleBulletList().run(),
    isActive: editor => editor.isActive('bulletList'),
    isEnabled: editor => editor.can().chain().focus().toggleBulletList().run(),
  },
  {
    name: 'orderedList',
    icon: 'fa-list-ol',
    title: 'Ordered list',
    run: editor => editor.chain().focus().toggleOrderedList().run(),
    isActive: editor => editor.isActive('orderedList'),
    isEnabled: editor => editor.can().chain().focus().toggleOrderedList().run(),
  },
  {
    name: 'blockquote',
    icon: 'fa-quote-right',
    title: 'Quote',
    run: editor => editor.chain().focus().toggleBlockquote().run(),
    isActive: editor => editor.isActive('blockquote'),
    isEnabled: editor => editor.can().chain().focus().toggleBlockquote().run(),
  },
  {
    name: 'codeblock',
    icon: 'fa-file-code-o',
    title: 'Code block',
    run: editor => editor.chain().focus().toggleCodeBlock().run(),
    isActive: editor => editor.isActive('codeBlock'),
    isEnabled: editor => editor.can().chain().focus().toggleCodeBlock().run(),
  },
  {
    name: 'horizontalRule',
    icon: 'fa-minus',
    title: 'Horizontal rule',
    run: editor => editor.chain().focus().setHorizontalRule().run(),
    isActive: () => false,
    isEnabled: editor => editor.can().chain().focus().setHorizontalRule().run(),
  },
  {
    name: 'link',
    icon: 'fa-link',
    title: 'Link',
    run: editor => {
      const previous = editor.getAttributes('link').href;
      const url = window.prompt('Insert link', previous || 'https://');
      if (url === null) {
        return false;
      }
      if (url === '') {
        return editor.chain().focus().extendMarkRange('link').unsetLink().run();
      }
      return editor.chain().focus().extendMarkRange('link').setLink({
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
      }).run();
    },
    isActive: editor => editor.isActive('link'),
    isEnabled: editor => editor.can().chain().focus().setLink({ href: 'https://example.com' }).run(),
  },
  {
    name: 'clear',
    icon: 'fa-eraser',
    title: 'Clear formatting',
    run: editor => editor.chain().focus().clearNodes().unsetAllMarks().run(),
    isActive: () => false,
    isEnabled: editor => editor.can().chain().focus().clearNodes().run(),
  },
  {
    name: 'undo',
    icon: 'fa-undo',
    title: 'Undo',
    run: editor => editor.chain().focus().undo().run(),
    isActive: () => false,
    isEnabled: editor => editor.can().chain().focus().undo().run(),
  },
  {
    name: 'redo',
    icon: 'fa-repeat',
    title: 'Redo',
    run: editor => editor.chain().focus().redo().run(),
    isActive: () => false,
    isEnabled: editor => editor.can().chain().focus().redo().run(),
  },
];

function buildCommandButton(command, editor) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-outline-secondary ubereditor-btn';
  button.innerHTML = `<i class="fa ${command.icon}"></i>`;
  button.title = command.title;
  button.dataset.command = command.name;
  button.addEventListener('click', event => {
    event.preventDefault();
    command.run(editor);
  });
  return button;
}

function updateToolbarState(toolbar, editor) {
  if (!toolbar) {
    return;
  }
  const blockSwitcher = toolbar.querySelector('.ubereditor-block-switcher');
  if (blockSwitcher) {
    if (editor.isActive('heading', { level: 2 })) {
      blockSwitcher.value = 'h2';
    } else if (editor.isActive('heading', { level: 3 })) {
      blockSwitcher.value = 'h3';
    } else if (editor.isActive('heading', { level: 4 })) {
      blockSwitcher.value = 'h4';
    } else {
      blockSwitcher.value = 'paragraph';
    }
  }
  toolbar.querySelectorAll('.ubereditor-btn').forEach(btn => {
    const name = btn.dataset.command;
    const command = COMMANDS.find(cmd => cmd.name === name);
    if (!command) {
      return;
    }
    try {
      btn.disabled = command.isEnabled(editor) === false;
      btn.classList.toggle('is-active', command.isActive(editor));
    } catch (err) {
      btn.disabled = true;
      btn.classList.remove('is-active');
    }
  });
}

function toggleFullscreen(wrapper) {
  if (!wrapper) {
    return;
  }
  wrapper.classList.toggle('ubereditor--fullscreen');
}

function createToolbar(editor, options) {
  const container = document.createElement('div');
  container.className = 'ubereditor-toolbar';
  container.appendChild(buildBlockSwitcher(editor));
  COMMANDS.forEach(command => {
    container.appendChild(buildCommandButton(command, editor));
  });
  if (options.allowFullscreen) {
    const fullscreenButton = document.createElement('button');
    fullscreenButton.type = 'button';
    fullscreenButton.className = 'btn btn-sm btn-outline-secondary ubereditor-btn ms-auto';
    fullscreenButton.innerHTML = '<i class="fa fa-arrows-alt"></i>';
    fullscreenButton.title = 'Toggle fullscreen';
    fullscreenButton.addEventListener('click', event => {
      event.preventDefault();
      toggleFullscreen(options.wrapper);
    });
    container.appendChild(fullscreenButton);
  }
  return container;
}

function buildFooter(restoredDraft) {
  const footer = document.createElement('div');
  footer.className = 'ubereditor-footer';
  const hint = document.createElement('span');
  hint.textContent = 'Markdown + LaTeX supported.';
  footer.appendChild(hint);
  if (restoredDraft) {
    const badge = document.createElement('span');
    badge.className = 'text-warning ms-auto';
    badge.textContent = 'Draft restored';
    footer.appendChild(badge);
  }
  return footer;
}

class UberEditorInstance {
  constructor({ textarea, editor, storageKey, autoSave }) {
    this.textarea = textarea;
    this.editor = editor;
    this.storageKey = storageKey;
    this.autoSave = autoSave;
  }

  syncValue(markdown) {
    this.textarea.value = markdown;
    if (this.autoSave && this.storageKey) {
      persistDraft(this.storageKey, markdown);
    }
  }

  destroy() {
    this.editor?.destroy();
  }
}

export default class UberEditor {
  static init(textarea) {
    const $textarea = $(textarea);
    const autoSaveEnabled = $textarea.data('local-persist') === true;
    const allowFullscreen = $textarea.data('button-fullscreen') !== false;
    const showHelpFormatting = $textarea.data('helper-formatting') === true;
    const shouldFocus = $textarea.prop('autofocus');
    const storageKey = autoSaveEnabled ? getPersistKey(textarea) : null;

    $textarea.hide();
    $textarea.removeProp('required');
    if (showHelpFormatting && $textarea.attr('id')) {
      $(`#hint_${$textarea.attr('id')}`).hide();
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'ubereditor-container';
    const editorHost = document.createElement('div');
    editorHost.className = 'ubereditor-content';
    wrapper.appendChild(editorHost);

    const persisted = loadPersistedDraft(storageKey);
    const serverValue = $textarea.val() || '';
    const restoredValue = persisted && typeof persisted.value === 'string' ? persisted.value : '';
    const hasRestoredValue = restoredValue && restoredValue !== serverValue;
    const initialMarkdown = hasRestoredValue ? restoredValue : serverValue;
    const initialHTML = initialMarkdown ? markdownParser.render(initialMarkdown) : '<p></p>';

    const editor = new Editor({
      element: editorHost,
      content: initialHTML,
      autofocus: shouldFocus ? 'end' : false,
      extensions: [
        StarterKit.configure({
          codeBlock: false,
        }),
        Underline,
        TextStyle,
        Color,
        Link.configure({
          linkOnPaste: true,
          openOnClick: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
          },
        }),
        Placeholder.configure({
          placeholder: $textarea.attr('placeholder') || 'Start typing…',
        }),
        CodeBlockLowlight.configure({
          lowlight: lowlightInstance,
        }),
      ],
      onUpdate: ({ editor }) => {
        UberEditor.syncTextarea(editor, textarea, storageKey, autoSaveEnabled);
      },
      onCreate: ({ editor }) => {
        UberEditor.syncTextarea(editor, textarea, storageKey, autoSaveEnabled);
      },
    });

    const toolbar = createToolbar(editor, { allowFullscreen, wrapper });
    wrapper.insertBefore(toolbar, editorHost);
    wrapper.appendChild(buildFooter(hasRestoredValue));
    textarea.parentNode.insertBefore(wrapper, textarea.nextSibling);

    const instance = new UberEditorInstance({
      textarea,
      editor,
      storageKey,
      autoSave: autoSaveEnabled,
    });
    wrapper.__uberEditorInstance = instance;
    window.__CSC__.config.uberEditors.push(editor);

    editor.on('selectionUpdate', () => updateToolbarState(toolbar, editor));
    editor.on('transaction', () => updateToolbarState(toolbar, editor));
    updateToolbarState(toolbar, editor);

    if (autoSaveEnabled && storageKey) {
      const form = $textarea.closest('form');
      if (form.length) {
        form.on('submit', () => removeDraft(storageKey));
      }
    }
    if ($textarea.attr('data-quicksend') === 'true') {
      editor.view.dom.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          $textarea.closest('form').trigger('submit');
        }
      });
    }
    return editor;
  }

  static syncTextarea(editor, textarea, storageKey, autoSave) {
    const html = editor.getHTML();
    const markdown = turndown.turndown(html);
    textarea.value = markdown;
    if (autoSave && storageKey) {
      persistDraft(storageKey, markdown);
    }
  }

  static preload(callback = function () {}) {
    $('body').addClass('tex2jax_ignore');
    const scripts = [window.__CSC__.config.JS_SRC.MATHJAX];
    const deferred = $.Deferred();
    let chained = deferred;
    $.each(scripts, function (i, url) {
      chained = chained.then(function () {
        return $.ajax({
          url: url,
          dataType: 'script',
          cache: true,
        });
      });
    });
    chained.done(callback);
    deferred.resolve();
  }

  static render(target) {
    MathJax.Hub.Queue([
      'Typeset',
      MathJax.Hub,
      target,
      function () {
        $(target)
          .find('pre')
          .addClass('hljs')
          .find('code')
          .each(function (i, block) {
            const t = block.innerHTML;
            block.innerHTML = _escape(_unescape(_unescape(t)));
            hljs.highlightElement(block);
          });
      },
    ]);
  }

  static reflowOnTabToggle(e) {
    const activeTab = $($(e.target).attr('href'));
    UberEditor.reflowEditor(activeTab);
  }

  static reflowEditor(editorWrapper) {
    editorWrapper.find('.ubereditor-container').each(function (_i, el) {
      const instance = el.__uberEditorInstance;
      if (instance && instance.editor && instance.editor.view) {
        instance.editor.view.updateState(instance.editor.state);
      }
    });
  }

  static cleanLocalStorage() {
    if (!hasLocalStorage()) {
      return;
    }
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) {
        continue;
      }
      if (key.startsWith('__epiceditor')) {
        keysToRemove.push(key);
        continue;
      }
      if (!key.startsWith(STORAGE_PREFIX)) {
        continue;
      }
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        keysToRemove.push(key);
        continue;
      }
      let shouldRemove = false;
      try {
        const payload = JSON.parse(raw);
        const updatedAt = payload.updatedAt ? new Date(payload.updatedAt).getTime() : 0;
        const isExpired = !updatedAt || Date.now() - updatedAt > STORAGE_TTL_MS;
        const hashes = window.__CSC__.config.localStorage.hashes || [];
        const isKnown = payload.hash && hashes.indexOf(payload.hash) !== -1;
        shouldRemove = isExpired || isKnown;
      } catch (err) {
        shouldRemove = true;
      }
      if (shouldRemove) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => window.localStorage.removeItem(key));
  }
}
