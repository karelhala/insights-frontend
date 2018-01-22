'use strict';

const componentsModule = require('../../');
const find = require('lodash/find');
const filter = require('lodash/filter');

/**
 * @ngInject
 */
function rhsaSeveritySelectCtrl($rootScope,
                                $scope,
                                $location,
                                gettextCatalog,
                                Events,
                                RhsaSeverityFilters,
                                FilterService) {
    const optionsMap = {};
    $scope.options = [];
    angular.extend($scope.options, RhsaSeverityFilters);

    // Add selected to each option to be used as the checkbox
    // ng-model
    $scope.options.forEach(function (option, index) {
        option.selected = false;
        optionsMap[index] = option.title;
        optionsMap[option.title] = index;
    });

    // default option is showing all rhsas
    // index for $scope.options
    const DEFAULT_OPTION = 0;

    /**
     * Initializes rhsa filter by checking for the url for
     * the previous filter or defaults to showing all rhsas/pacakges/cves.
     */
    (function init() {
        Object.freeze(optionsMap);
        let option = $location.search()[Events.filters.rhsaSeverity] ?
                     $location.search()[Events.filters.rhsaSeverity] :
                     FilterService.getRhsaSeverity();

        if (option) {
            option = option.split(',');
            option.forEach(function (option) {
                $scope.options[optionsMap[option]].selected = true;
            });

            broadcastTabs();
        } else {
            setDefaultOption();
        }
    })();

    /**
     * Returns the string representation for one or more selected options.
     *
     * @return {String} representation showing there are one or
     *                  more options selected
     */
    $scope.getSelectedString = function () {
        let options = filter($scope.options, {selected: true});

        return options.length === 1 ? options[0].title : 'multiple';
    };

    /**
     * Concatenates the tabs if multiple severities are chosen.
     *
     * @return {String} tag for filters
     */
    function broadcastTabs() {
        filter($scope.options, {selected: true}).forEach((option) => {
            $rootScope.$broadcast(Events.filters.tag,
                              option.tag,
                              Events.filters.rhsaSeverity);
        });
    }

    /**
     * Sets url query and broadcasts events to execute the query.
     */
    $scope.doFilter = function () {
        setURL();
        broadcastTabs();
    };

    function setURL() {
        let str = '';
        $scope.options.forEach(function (option, index) {
            if (option.selected && str === '' &&
                index !== DEFAULT_OPTION) {
                str = option.title;
            } else if (option.selected && index !== DEFAULT_OPTION) {
                str += `,${option.title}`;
            }
        });

        if (str === '') {
            FilterService.setRhsaSeverity(DEFAULT_OPTION);
            FilterService.deleteQueryParam(Events.filters.rhsaSeverity);
        } else {
            FilterService.setRhsaSeverity(str);
        }

        FilterService.doFilter();
        $rootScope.$broadcast(Events.filters.rhsaSeverity, str);

        return str;
    }

    /**
     * Watches for changes in the object that keeps track of selected
     * checkboxes.
     */
    $scope.$watch('options', setSelectedOptions, true);

    function setSelectedOptions(newVal, old) {
        if (newVal === old) {
            return;
        }

        if (newVal[DEFAULT_OPTION].selected && !old[DEFAULT_OPTION].selected) {
            setDefaultOption();
            return;
        }

        let isOptionSelected = false;
        $scope.options.forEach(function (option, index) {
            // if something other than all is selected than All is deselected
            if (option.selected && index !== DEFAULT_OPTION) {
                isOptionSelected = true;
                $scope.options[DEFAULT_OPTION].selected = false;
            }
        });

        if (!isOptionSelected) {
            $scope.options[DEFAULT_OPTION].selected = true;
        }
    }

    /**
     * sets selected option to the default
     */
    function setDefaultOption() {
        filter($scope.options, {selected: true}).forEach((option) => {
            option.selected = false;
        });

        $scope.options[DEFAULT_OPTION].selected = true;
    }

    $scope.$on(Events.filters.reset, function () {
        setDefaultOption();
        setURL();
        broadcastTabs();
    });

    $scope.$on(Events.filters.removeTag, function (event, filter, tag) {
        if (filter === Events.filters.rhsaSeverity) {
            find($scope.options, {tag: tag}).selected = false;
            setSelectedOptions();
            setURL();
            broadcastTabs();
        }
    });
}

function rhsaSeveritySelect() {
    return {
        templateUrl:
          'js/components/filterComponents/rhsaSeveritySelect/rhsaSeveritySelect.html',
        restrict: 'E',
        controller: rhsaSeveritySelectCtrl,
        scope: {}
    };
}

componentsModule.directive('rhsaSeveritySelect', rhsaSeveritySelect);
