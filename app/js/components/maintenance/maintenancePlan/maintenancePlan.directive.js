'use strict';

var componentsModule = require('../../');
var assign = require('lodash/assign');
var map = require('lodash/map');
const find = require('lodash/find');
const FileSaver = require('file-saver');
const parseHeader = require('parse-http-header');
const some = require('lodash/some');
const get = require('lodash/get');
const sortBy = require('lodash/sortBy');
const swal = require('sweetalert2');
const filter = require('lodash/filter');
const flatMap = require('lodash/flatMap');
const uniqBy = require('lodash/uniqBy');
const moment = require('moment-timezone');

const TAB_MAPPING = {
    undefined: 0,
    systems: 1,
    playbook: 2
};

//This handles the "basic" edit mode of a plan. Activated by clicking the hidden
//'Click to edit this plan' button next to the plan name.
function BasicEditHandler(plan, Maintenance, Utils, cb) {
    this.active = false;
    this.plan = plan;
    this.Maintenance = Maintenance;
    this.Utils = Utils;
    this.cb = cb;
}

BasicEditHandler.prototype.init = function () {
    if (this.plan) {
        this.name = this.plan.name;
        this.description = this.plan.description;
        if (this.plan.start) {
            this.start = moment(this.plan.start);
            let d = this.start;

            // we need to convert to Date (which possibly uses a different timezone)
            // so that we can bind the input to it
            this.time = new Date(d.year(), d.month(), d.day(), d.hour(), d.minute());
            this.duration = Math.round((this.plan.end - this.plan.start) / (60 * 1000));
        } else {
            this.start = null;
            this.time = null;
            this.duration = null;
        }
    } else {
        this.name = '';
        this.description = '';
        this.start = moment().startOf('day');
        this.dateChanged(this.start);
    }
};

BasicEditHandler.prototype.dateChanged = function (value) {
    if (value && !this.time) {
        this.time =
            new Date(
                this.start.year(),
                this.start.month(),
                this.start.day(),
                22, 0);
        this.duration = 60;
        this.sync();
    }
};

BasicEditHandler.prototype.sync = function () {
    if (this.start && this.time) {
        this.start.hours(this.time.getHours());
        this.start.minutes(this.time.getMinutes());
    }
};

BasicEditHandler.prototype.toggle = function () {
    if (!this.active) {
        this.init();
    }

    this.active = !this.active;
};

BasicEditHandler.prototype.getStart = function () {
    if (this.start) {
        return this.start.clone().toDate();
    }

    return null;
};

BasicEditHandler.prototype.getEnd = function () {
    if (this.start) {
        return this.start.clone().add(Math.max(this.duration, 1), 'm').toDate();
    }

    return null;
};

BasicEditHandler.prototype.save = function () {
    this.sync();
    if (this.cb) {
        return this.cb(this.name, this.description, this.getStart(), this.getEnd(), this);
    }
};

/**
 * @ngInject
 */
function maintenancePlanCtrl(
    $location,
    $modal,
    $rootScope,
    $scope,
    $state,
    $stateParams,
    $timeout,
    $document,
    gettextCatalog,
    sweetAlert,
    DataUtils,
    Events,
    Group,
    InsightsConfig,
    Maintenance,
    MaintenanceService,
    SystemsService,
    Utils) {

    $scope.pager = new Utils.Pager(10);
    $scope.loader = new Utils.Loader();
    $scope.exportPlan = Maintenance.exportPlan;
    $scope.error = null;
    $scope.MaintenanceService = MaintenanceService;
    $scope.ansibleRunner = InsightsConfig.ansibleRunner;

    $scope.editDateTooltip = gettextCatalog.getString(
        'Date, time and duration of a maintenance window can be defined here. ' +
        'If a maintenance window for this plan is set then Insights will verify that ' +
        'all the actions in this plan are resolved once the window ends. Insights will ' +
        'warn you this plan is not fully resolved when the maintenance window ends.');

    const CURRENT_GROUP_PREFIX = gettextCatalog.getString('Current Group');

    $scope.editBasic = new BasicEditHandler(
        $scope.plan,
        Maintenance,
        Utils,
        $scope.loader.bind(function (name, description, start, end, handler) {

            $scope.plan.description = description;
            return Maintenance.updatePlan($scope.plan.maintenance_id, {
                name: name,
                description: description,
                start: start,
                end: end
            }).then(function () {
                handler.active = false;
                if (!Utils.datesEqual($scope.plan.end, end) ||
                    !Utils.datesEqual($scope.plan.start, start)) {
                    $scope.loadPlans(true).then(function () {
                        $scope.scrollToPlan($scope.plan.maintenance_id);
                    });
                } else {
                    $scope.plan.name = name;
                    handler.plan = $scope.plan;
                }
            });
        }));

    $scope.removeActions = $scope.loader.bind(function (actions) {
        return MaintenanceService.plans.update($scope.plan, {
            delete: map(actions, 'id')
        });
    });

    $scope.silence = $scope.loader.bind(function () {
        $scope.plan.silenced = true;
        Maintenance.silence($scope.plan).then(function () {
            if ($scope.edit.isActive($scope.plan.maintenance_id)) {
                $scope.edit.toggle($scope.plan.maintenance_id);
            }
        });
    });

    $scope.delete = function () {
        sweetAlert({
            text: gettextCatalog.getString(
                'You will not be able to recover this maintenance plan')
        }).then($scope.loader.bind(function () {
            $scope.edit.deactivate($scope.plan.maintenance_id);
            return Maintenance.deletePlan($scope.plan);
        }));
    };

    $scope.showSystemModal = MaintenanceService.showSystemModal;

    $scope.addSystem = new AddActionSelectionHandler($scope);
    $scope.addRule = new AddActionSelectionHandler($scope);

    $scope.systemTableParams = MaintenanceService.systemTableParams;
    $scope.actionTableParams = MaintenanceService.actionTableParams;

    function tryFindItemInPlan (item, systems) {
        if (systems) {
            return find($scope.plan.rules, {id: item.rule_id});
        } else {
            return find($scope.plan.systems, {system_id: item.system_id});
        }
    }

    $scope.tableParams = function (item, systems, newTable) {
        const plannedItem = tryFindItemInPlan(item, systems);
        const actions = (plannedItem) ? plannedItem.actions : [];
        const loader = (newTable) ? $scope.loader : undefined;

        if (systems) {
            return MaintenanceService.systemTableParams(
                plannedItem || item,
                $scope.plan,
                actions,
                loader);
        } else {
            return MaintenanceService.actionTableParams(
                plannedItem || item,
                $scope.plan,
                actions,
                loader);
        }
    };

    $scope.minimize = function () {
        // don't minimize right away because that messes up with the global click handler
        $timeout(function () {
            $scope.error = null;
            $scope.edit.deactivate($scope.plan.maintenance_id);
        });
    };

    $scope.export = function () {
        Maintenance.exportPlan($scope.plan.maintenance_id);
    };

    $scope.downloadPlaybook = function () {
        if (!$scope.ansibleSupport) {
            return;
        }

        if ($scope.selectTab) {
            $scope.selectTab('playbook');
        }

        Maintenance.downloadPlaybook($scope.plan.maintenance_id)
        .then(function (response) {
            if (response.status === 200) {
                const disposition = response.headers('content-disposition');
                const filename = parseHeader(disposition).filename.replace(/"/g, '');
                const blob = new Blob([response.data],
                                      {type: response.headers('content-type')});
                FileSaver.saveAs(blob, filename);
            }
        });
    };

    $scope.runPlaybook = function (button) {
        if (!$scope.ansibleRunner) {
            return;
        }

        return $scope.ansibleRunner($location, $scope.plan.maintenance_id, button);
    };

    $scope.dateChanged = function (unused, value, explicit) {
        if (explicit) {
            $scope.editBasic.dateChanged(value);
        }
    };

    $scope.minimize = function () {
        if ($scope.editBasic.active) {
            $scope.editBasic.toggle();
        }

        $scope.error = null;
        $scope.edit.deactivate($scope.plan.maintenance_id);
    };

    $scope.$on('telemetry:esc', function ($event) {
        if ($event.defaultPrevented) {
            return;
        }

        if (swal.isVisible()) {
            return;
        }

        if ($scope.edit.isActive($scope.plan.maintenance_id) &&
            !$scope.editBasic.active) {

            $scope.error = null;
            $scope.edit.deactivate($scope.plan.maintenance_id);
        }
    });

    $scope.update = $scope.loader.bind(function (data) {
        $scope.error = null;
        return Maintenance.updatePlan($scope.plan.maintenance_id, data);
    });

    $scope.hidden = function (value) {
        function cb () {
            var data = {hidden: value};
            if ($scope.plan.suggestion === Maintenance.SUGGESTION.REJECTED) {
                data.suggestion = Maintenance.SUGGESTION.PROPOSED;
            }

            $scope.update(data).then(function () {
                assign($scope.plan, data);
                $rootScope.$broadcast(Events.planner.planChanged,
                    $scope.plan.maintenance_id);
            });
        }

        if (!value) {
            sweetAlert({
                text: gettextCatalog.getString(
                    'You are about to send a plan suggestion to the customer.')
            }).then(cb);
        } else {
            cb();
        }
    };

    $scope.accept = function () {
        var data = {suggestion: Maintenance.SUGGESTION.ACCEPTED};
        $scope.update(data).then(function () {
            assign($scope.plan, data);
            $rootScope.$broadcast(Events.planner.planChanged, $scope.plan.maintenance_id);
            $scope.scrollToPlan($scope.plan.maintenance_id);
        });
    };

    $scope.reject = function () {
        var data = {suggestion: Maintenance.SUGGESTION.REJECTED};
        $scope.update(data).then(function () {
            assign($scope.plan, data);
            $scope.plan.hidden = true;
            $rootScope.$broadcast(Events.planner.planChanged, $scope.plan.maintenance_id);
            if (!MaintenanceService.plans.suggested.length) {
                $scope.setCategory('unscheduled');
            }
        });
    };

    $scope.isReadOnly = function () {
        return $scope.plan.isReadOnly() && !$scope.isInternal;
    };

    $scope.registerGroupChangeListener = function (uiSelect) {
        const unregister = $rootScope.$on('group:change', function () {
            if (uiSelect.refreshItems) {
                uiSelect.refreshItems();
            }
        });

        $scope.$on('$destroy', unregister);
    };

    $scope.groupBySystemType = function (system) {
        const group = Group.current();

        if (group.display_name !== undefined) {
            if (find(group.systems, {system_id: system.system_id})) {
                return `${CURRENT_GROUP_PREFIX}: ${group.display_name}`;
            }
        }

        // this is safe as system select won't be shown before system types are loaded
        return get(SystemsService.getSystemTypeUnsafe(system.system_type_id),
            'displayName');
    };

    $scope.groupFilter = function (groups) {
        return sortBy(groups, [function (group) {
            return !group.name.startsWith(CURRENT_GROUP_PREFIX);
        }, 'name']);
    };

    function checkAnsibleSupport () {
        $scope.error = null;
        $scope.ansibleSupport = some($scope.plan.actions, 'rule.ansible');
    }

    $scope.$watch('plan.actions', checkAnsibleSupport);

    $scope.playbookTabLoader = new Utils.Loader(false);
    $scope.prepareAnsibleTab = $scope.playbookTabLoader.bind(function () {
        return SystemsService.getSystemTypesAsync().then(function () {
            return Maintenance.getPlayMetadata($scope.plan.maintenance_id);
        }).then(function (res) {
            $scope.plays = res.data;

            $scope.plays.forEach(function (play) {
                play.systemType = SystemsService.getSystemTypeUnsafe(play.system_type_id);
                play.systems = map(filter($scope.plan.actions, function (action) {
                    return action.rule.rule_id === play.rule.rule_id &&
                        action.system.system_type_id === play.system_type_id;
                }), 'system');
            });

            $scope.systemsToReboot = uniqBy(flatMap(filter($scope.plays,
                'ansible_resolutions[0].needs_reboot'), 'systems'), 'system_id');
        });
    });

    $scope.setupTabActivator = function (value) {
        value.$watch('tabs', function (tabs) {
            if (tabs) {
                $scope.selectTab = function (name, ignoreUrl) {
                    const tab = TAB_MAPPING[name];

                    if (tab !== undefined) {
                        tabs[tab].select();
                        if (!ignoreUrl) {
                            $scope.tabSelected(name);
                        }
                    }
                };
            }
        });
    };

    $scope.tabSelected = function () {

        // this double-assignment is a workaround for how ui-bootstrap handles selection
        $scope.tabSelected = function (name) {
            $state.transitionTo($state.current, {
                maintenance_id: $stateParams.maintenance_id,
                tab: name
            }, {
                notify: false,
                reload: false,
                location: 'replace'
            });
        };

        if ($stateParams.maintenance_id && $stateParams.tab && $scope.selectTab) {
            $scope.selectTab($stateParams.tab, true);
        }
    };

    $scope.resolutionModal = function (play) {
        return MaintenanceService.resolutionModal($scope.plan, play, 0, 0)
            .then($scope.prepareAnsibleTab);
    };

    $scope.addActions = function () {
        return MaintenanceService.showMaintenanceModal(null, null, $scope.plan)
            .then($scope.prepareAnsibleTab);
    };

    $scope.allowRebootChanged = function () {
        return Maintenance.updatePlan($scope.plan.maintenance_id, {
            allow_reboot: $scope.plan.allow_reboot
        });
    };

    function deleteHandler (event) {
        if ($scope.edit.isActive($scope.plan.maintenance_id) && event.keyCode === 46) {
            $scope.delete();
        }
    }

    $document.on('keydown', deleteHandler);
    $scope.$on('$destroy', function () {
        $document.off('keydown', deleteHandler);
    });
}

function AddActionSelectionHandler ($scope) {
    var self = this;
    self.reset();
    $scope.$watch('edit.isActive(plan.maintenance_id)', function () {
        self.reset();
    });
}

AddActionSelectionHandler.prototype.reset = function () {
    this.selected = null;
};

function maintenancePlan($document) {

    function isContainedBy($event, className) {
        var elements = $document[0].getElementsByClassName(className);
        for (let i = 0; i < elements.length; i++) {
            if (elements.item(i).contains($event.target)) {
                return true;
            }
        }
    }

    return {
        templateUrl: 'js/components/maintenance/maintenancePlan/maintenancePlan.html',
        restrict: 'E',
        controller: maintenancePlanCtrl,
        replace: true,
        link: function (scope, element) {
            function clickHandler($event) {

                if (scope.editBasic.active) {
                    return; // if edit form is on we ignore clicks outside of the plan
                }

                if (isContainedBy($event, 'modal')) {
                    return;  // clicking on a modal does not retract a plan
                }

                if (isContainedBy($event, 'swal2-container')) {
                    return;  // clicking on a sweet-alert does not retract a plan
                }

                if (isContainedBy($event, 'top-bar')) {
                    return; // clicking on a topbar does not retract a plan
                }

                if ($event.target.classList.contains('action') ||
                    ($event.target.parentElement &&
                    $event.target.parentElement.classList.contains('action'))) {

                    return; // clicking an .action does not cause plan extend/retract
                }

                let planHit = element[0].contains($event.target);
                let bodyHit = $document[0].body.contains($event.target);
                let active = scope.edit.isActive(scope.plan.maintenance_id);

                if (active &&
                    $document[0].getElementsByClassName('ui-select-choices-row').length) {

                    // ui-select is open -
                    // this click retracts ui-select-choices, not the entire plan
                    return;
                }

                if (!active && planHit) {
                    scope.edit.activate(scope.plan.maintenance_id);
                } else if (bodyHit && !isContainedBy($event, 'plan-wrap') &&
                    Object.keys(scope.edit.items).length) {
                    scope.edit.reset();
                }
            }

            $document.on('click', clickHandler);
            scope.$on('$destroy', function () {
                $document.off('click', clickHandler);
            });
        }
    };
}

componentsModule.directive('maintenancePlan', maintenancePlan);
