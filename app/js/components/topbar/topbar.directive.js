/*global require*/
'use strict';

var componentsModule = require('../');
const includes = require('lodash/includes');

// global filters are disabled in these states
const DISABLED_STATES = [
    'app.config',
    'app.digests',
    'app.rules'
];

/**
 * @ngInject
 */
function TopbarCtrl($scope, InsightsConfig, $state) {
    $scope.gettingStartedLink = InsightsConfig.gettingStartedLink;

    $scope.isPortal = InsightsConfig.isPortal;
    $scope.isGroupsEnabled = InsightsConfig.isGroupsEnabled;

    function checkState () {
        $scope.disabled = includes(DISABLED_STATES, $state.current.name);
    }

    $scope.$on('$stateChangeSuccess', checkState);
    checkState();
}

/**
 * @ngInject
 */
function topbar() {
    return {
        templateUrl: 'js/components/topbar/topbar.html',
        restrict: 'E',
        controller: TopbarCtrl,
        replace: false
    };
}

componentsModule.directive('topbar', topbar);
