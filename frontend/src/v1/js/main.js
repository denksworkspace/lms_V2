import './bootstrap5-compat';
import $ from 'jquery';
import 'jgrowl/jquery.jgrowl.js';
import 'bootstrap-select/js/bootstrap-select';
import 'jasny-bootstrap/js/fileinput';

import 'mathjax_config';
import UberEditor from 'components/editor';
import { csrfSafeMethod, getCSRFToken, getSections, showComponentError, loadReactApplications, createNotification } from './utils';
import hljs from 'highlight.js'

const CSC = window.__CSC__;
const THEME_STORAGE_KEY = 'csc-theme';
const NAV_BREAKPOINT = 992;

$(document).ready(function () {
  configureCSRFAjax();
  displayNotifications();
  renderText();
  initUberEditors();
  initCollapsiblePanelGroups();
  setupFileInputs();
  initThemeToggle();
  initMobileNav();

  let sections = getSections();
  if (sections.includes('datetimepickers')) {
    import('components/forms')
      .then(m => {
        m.initDatePickers();
        m.initTimePickers();
      })
      .catch(error => showComponentError(error));
  }
  if (sections.includes('selectpickers')) {
    import('components/forms')
      .then(m => {
        m.initSelectPickers();
      })
      .catch(error => showComponentError(error));
  }
  if (sections.includes('lazy-img')) {
    import(/* webpackChunkName: "lazyload" */ 'components/lazyload')
      .then(m => m.launch())
      .catch(error => showComponentError(error));
  }
  // FIXME: combine into one peace `courses`?
  if (sections.includes('courseDetails')) {
    import(/* webpackChunkName: "courseDetails" */ 'courses/courseDetails')
      .then(m => m.launch())
      .catch(error => showComponentError(error));
  }
  if (sections.includes('courseOfferings')) {
    import(/* webpackChunkName: "courseOfferings" */ 'courses/courseOfferings')
      .then(m => m.launch())
      .catch(error => showComponentError(error));
  }
  if (sections.includes('profile')) {
    import(/* webpackChunkName: "profile" */ 'users/profile')
      .then(m => m.launch())
      .catch(error => showComponentError(error));
  }
  if (sections.includes('learning/solution')) {
    import(/* webpackChunkName: "solution" */ 'learning/solution')
      .then(m => m.launch())
      .catch(error => showComponentError(error));
  }

  loadReactApplications();
});

function displayNotifications() {
  if (window.__CSC__.notifications !== undefined) {
    window.__CSC__.notifications.forEach(message => {
      $.jGrowl(message.text, {
        position: 'bottom-right',
        sticky: message.timeout !== 0,
        theme: message.type
      });
    });
  }
}

function configureCSRFAjax() {
  // Append csrf token on ajax POST requests made with jQuery
  // FIXME: add support for allowed subdomains
  $.ajaxSetup({
    beforeSend: function (xhr, settings) {
      if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
        xhr.setRequestHeader('X-CSRFToken', getCSRFToken());
      }
    }
  });
}

function renderText() {
  // highlight js and MathJax
  const $ubertexts = $('div.ubertext');
  // Note: MathJax and hljs loads for each iframe separately
  if ($ubertexts.length > 0) {
    UberEditor.preload(function () {
      // Configure highlight js
      hljs.configure({ tabReplace: '    ' });
      // Render Latex and highlight code
      $ubertexts.each(function (i, target) {
        UberEditor.render(target);
      });
    });
  }
}

function initUberEditors() {
  // Replace textarea with the rich text editor
  const $ubereditors = $('textarea.ubereditor');
  UberEditor.cleanLocalStorage($ubereditors);
  $ubereditors.each(function (i, textarea) {
    const editor = UberEditor.init(textarea);
    CSC.config.uberEditors.push(editor);
  });
  if ($ubereditors.length > 0) {
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', UberEditor.reflowOnTabToggle);
  }
}

function initCollapsiblePanelGroups() {
  $('.panel-group').on('click', '.panel-heading._arrowed', function (e) {
    // Replace js animation with css.
    e.preventDefault();
    const open = $(this).attr('aria-expanded') === 'true';
    $(this).next().toggleClass('collapse').attr('aria-expanded', !open);
    $(this).attr('aria-expanded', !open);
  });
}

function setupFileInputs() {
  $('.jasny.fileinput')
    .on('clear.bs.fileinput', function (event) {
      $(event.target).find('.fileinput-clear-checkbox').val('on');
      $(event.target).find('.fileinput-filename').text('No file selected');
    })
    .on('change.bs.fileinput', function (event) {
      $(event.target).find('.fileinput-clear-checkbox').val('');
    })
    .on('reseted.bs.fileinput', function (event) {
      $(event.target).find('.fileinput-filename').text('No file selected');
      $(event.target).find('.fileinput-clear-checkbox').val('on');
    });
  const fileInputs = document.querySelectorAll('.jasny.fileinput input[type="file"]')
  const maxUploadSize = window.__CSC__.config.maxUploadSize
  const maxUploadSizeStr = maxUploadSize / 1024 / 1024 + ' MiB'
  fileInputs.forEach(fileInput => {
    fileInput.addEventListener('change', e => {
      for (const file of e.target.files) {
        if (file.size > maxUploadSize) {
          createNotification('Cannot upload files larger than ' + maxUploadSizeStr, 'error')
          e.target.value = null
        }
      }
    })
  })
}

function initThemeToggle() {
  const toggle = document.querySelector('[data-theme-toggle]');
  if (!toggle) {
    return;
  }
  const root = document.documentElement;
  const label = toggle.querySelector('[data-theme-toggle-label]');
  const labelDark = toggle.getAttribute('data-label-dark') || 'Dark mode';
  const labelLight = toggle.getAttribute('data-label-light') || 'Light mode';

  const applyTheme = (theme) => {
    root.setAttribute('data-theme', theme);
    toggle.setAttribute('aria-pressed', theme === 'dark');
    if (label) {
      label.textContent = theme === 'dark' ? labelDark : labelLight;
    }
  };

  const storeTheme = (theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (err) {
      // Ignore storage failures (e.g., Safari private mode)
    }
  };

  const readStoredTheme = () => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch (err) {
      return null;
    }
  };

  const getPreferredTheme = () => {
    const stored = readStoredTheme();
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    return 'light';
  };

  const setTheme = (theme) => {
    applyTheme(theme);
    storeTheme(theme);
  };

  setTheme(getPreferredTheme());

  toggle.addEventListener('click', () => {
    const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  });

  if (window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => {
      if (readStoredTheme()) {
        return;
      }
      applyTheme(event.matches ? 'dark' : 'light');
    };
    if (media.addEventListener) {
      media.addEventListener('change', handleChange);
    } else if (media.addListener) {
      media.addListener(handleChange);
    }
  }
}

function initMobileNav() {
  const navToggle = document.querySelector('[data-menu-toggle]');
  const navPanel = document.querySelector('[data-menu-panel]');
  const header = document.querySelector('.header');
  if (!navToggle || !navPanel || !header) {
    return;
  }

  const closeNav = () => {
    header.classList.remove('header--nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
  };

  const openNav = () => {
    header.classList.add('header--nav-open');
    navToggle.setAttribute('aria-expanded', 'true');
  };

  navToggle.addEventListener('click', () => {
    if (header.classList.contains('header--nav-open')) {
      closeNav();
    } else {
      openNav();
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape' && header.classList.contains('header--nav-open')) {
      closeNav();
      navToggle.focus();
    }
  });

  navPanel.addEventListener('click', (event) => {
    if (event.target.closest('a') && window.innerWidth < NAV_BREAKPOINT) {
      closeNav();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= NAV_BREAKPOINT) {
      closeNav();
    }
  });
}
