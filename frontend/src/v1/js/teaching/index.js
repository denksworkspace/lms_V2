import '../bootstrap5-compat';
import { showComponentError, getSections } from 'utils';

$(document).ready(function () {
  let sections = getSections();
  if (sections.includes('tooltips')) {
    const tooltipConstructor = window.bootstrap && window.bootstrap.Tooltip;
    const allowList =
      (tooltipConstructor && tooltipConstructor.Default && tooltipConstructor.Default.allowList) ||
      ($.fn.tooltip.Constructor &&
        $.fn.tooltip.Constructor.DEFAULTS &&
        $.fn.tooltip.Constructor.DEFAULTS.whiteList);
    if (allowList) {
      allowList.dl = ['class'];
      allowList.dd = [];
      allowList.dt = [];
    }
    $('[data-bs-toggle="tooltip"]').tooltip();
  }
  if (sections.includes('studentAssignment')) {
    import(/* webpackChunkName: "gradebook" */ 'teaching/studentAssignment')
      .then(module => {
        const component = module.default;
        component.launch();
      })
      .catch(error => showComponentError(error));
  } else if (sections.includes('studentGroups')) {
    import(/* webpackChunkName: "studentGroups" */ 'teaching/studentGroups')
      .then(module => {
        const launch = module.default;
        launch();
      })
      .catch(error => showComponentError(error));
  }

  if (sections.includes('gradebook')) {
    import(/* webpackChunkName: "gradebook" */ 'teaching/gradebook')
      .then(module => {
        const component = module.default;
        component.launch();
      })
      .catch(error => showComponentError(error));
  } else if (sections.includes('submissions')) {
    import(/* webpackChunkName: "submissions" */ 'teaching/submissions')
      .then(m => {
        const component = m.default;
        component.launch();
      })
      .catch(error => showComponentError(error));
  } else if (sections.includes('assignmentForm')) {
    import(/* webpackChunkName: "assignmentForm" */ 'teaching/assignmentForm')
      .then(m => {
        m.default();
      })
      .catch(error => showComponentError(error));
  }
});
