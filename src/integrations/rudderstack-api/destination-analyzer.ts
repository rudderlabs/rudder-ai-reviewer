/**
 * Destination Impact Analyzer
 * Analyzes how SDK changes affect downstream destinations
 */

import * as core from '@actions/core';
import {
  DestinationConfig,
  DestinationImpact,
  FieldMapping,
  Issue,
  IssueSeverity,
} from '../../types/common';
import { PropertyChange, EventChange } from '../../types/common';

export interface DestinationAnalysisResult {
  impacts: DestinationImpact[];
  issues: Issue[];
}

/**
 * Analyze destination impacts from property changes
 */
export function analyzeDestinationImpacts(
  destinations: DestinationConfig[],
  propertyChanges: PropertyChange[],
  eventChanges: EventChange[]
): DestinationAnalysisResult {
  core.info(`Analyzing impact on ${destinations.length} destinations...`);

  const impacts: DestinationImpact[] = [];
  const issues: Issue[] = [];

  // Filter only enabled destinations
  const enabledDestinations = destinations.filter((d) => d.enabled);

  if (enabledDestinations.length === 0) {
    core.info('No enabled destinations found');
    return { impacts, issues };
  }

  // Analyze property changes
  for (const change of propertyChanges) {
    const destinationImpacts = analyzePropertyChange(change, enabledDestinations);
    impacts.push(...destinationImpacts);

    // Create issues from impacts
    for (const impact of destinationImpacts) {
      if (impact.severity === 'error' || impact.severity === 'warning') {
        issues.push(createIssueFromImpact(impact, change));
      }
    }
  }

  // Analyze event changes
  for (const change of eventChanges) {
    const destinationImpacts = analyzeEventChange(change, enabledDestinations);
    impacts.push(...destinationImpacts);

    for (const impact of destinationImpacts) {
      if (impact.severity === 'error' || impact.severity === 'warning') {
        issues.push(createIssueFromEventImpact(impact, change));
      }
    }
  }

  core.info(`Found ${impacts.length} destination impacts`);
  return { impacts, issues };
}

/**
 * Analyze how a property change affects destinations
 */
function analyzePropertyChange(
  change: PropertyChange,
  destinations: DestinationConfig[]
): DestinationImpact[] {
  const impacts: DestinationImpact[] = [];

  for (const destination of destinations) {
    const impact = analyzePropertyChangeForDestination(change, destination);
    if (impact) {
      impacts.push(impact);
    }
  }

  return impacts;
}

/**
 * Analyze property change for a specific destination
 */
function analyzePropertyChangeForDestination(
  change: PropertyChange,
  destination: DestinationConfig
): DestinationImpact | null {
  const affectedMappings: FieldMapping[] = [];
  let severity: IssueSeverity = 'warning';
  let description = '';

  // Check if destination has field mappings
  if (!destination.fieldMappings) {
    // No explicit mappings, use generic warnings
    return createGenericImpact(change, destination);
  }

  // Check if this property is mapped
  const mappedField = destination.fieldMappings[change.propertyName];

  if (!mappedField) {
    // Property not explicitly mapped, may still affect destination
    if (change.changeType === 'added') {
      return null; // New unmapped property, no impact
    }

    return createGenericImpact(change, destination);
  }

  // Property is explicitly mapped
  switch (change.changeType) {
    case 'type_changed':
      affectedMappings.push({
        sourceProperty: change.propertyName,
        destinationField: mappedField,
        changeType: 'type_changed',
        impact: `Type change from ${change.oldType} to ${change.newType} may cause data processing issues`,
      });
      severity = 'error';
      description = getDestinationSpecificTypeChangeMessage(
        destination.type,
        change.propertyName,
        mappedField,
        change.oldType,
        change.newType
      );
      break;

    case 'removed':
      affectedMappings.push({
        sourceProperty: change.propertyName,
        destinationField: mappedField,
        changeType: 'removed',
        impact: `Mapped field '${mappedField}' will no longer receive data`,
      });
      severity = 'warning';
      description = getDestinationSpecificRemovalMessage(
        destination.type,
        change.propertyName,
        mappedField
      );
      break;

    case 'added':
      affectedMappings.push({
        sourceProperty: change.propertyName,
        destinationField: mappedField,
        changeType: 'added',
        impact: `New property will be mapped to '${mappedField}'`,
      });
      severity = 'suggestion';
      description = `New property '${change.propertyName}' will be sent to ${destination.name} as '${mappedField}'`;
      break;

    case 'structure_changed':
      affectedMappings.push({
        sourceProperty: change.propertyName,
        destinationField: mappedField,
        changeType: 'type_changed',
        impact: 'Property structure changed, may affect data processing',
      });
      severity = 'warning';
      description = `Property '${change.propertyName}' structure changed, mapped field '${mappedField}' in ${destination.name} may be affected`;
      break;
  }

  if (affectedMappings.length === 0) {
    return null;
  }

  return {
    destinationName: destination.name,
    destinationType: destination.type,
    affectedMappings,
    severity,
    description,
  };
}

/**
 * Create generic impact when no field mappings available
 */
function createGenericImpact(
  change: PropertyChange,
  destination: DestinationConfig
): DestinationImpact | null {
  let severity: IssueSeverity = 'warning';
  let description = '';

  switch (change.changeType) {
    case 'type_changed':
      severity = 'warning';
      description = `Type change in '${change.propertyName}' (${change.oldType} → ${change.newType}) may affect ${destination.name}`;
      break;
    case 'removed':
      severity = 'warning';
      description = `Removed property '${change.propertyName}' may affect ${destination.name} if it was being used`;
      break;
    case 'structure_changed':
      severity = 'warning';
      description = `Structure change in '${change.propertyName}' may affect ${destination.name}`;
      break;
    default:
      return null;
  }

  return {
    destinationName: destination.name,
    destinationType: destination.type,
    affectedMappings: [],
    severity,
    description,
  };
}

/**
 * Analyze event change impact
 */
function analyzeEventChange(
  change: EventChange,
  destinations: DestinationConfig[]
): DestinationImpact[] {
  const impacts: DestinationImpact[] = [];

  // Event removals typically have high impact
  for (const destination of destinations) {
    const severity: IssueSeverity = 'warning';
    const description = `Event '${change.eventName}' will no longer be sent to ${destination.name}`;

    impacts.push({
      destinationName: destination.name,
      destinationType: destination.type,
      affectedMappings: [],
      severity,
      description,
    });
  }

  return impacts;
}

/**
 * Get destination-specific type change message
 */
function getDestinationSpecificTypeChangeMessage(
  destinationType: string,
  propertyName: string,
  mappedField: string,
  oldType?: string,
  newType?: string
): string {
  const typeChange = oldType && newType ? ` from ${oldType} to ${newType}` : '';

  switch (destinationType.toLowerCase()) {
    case 'google_analytics':
    case 'ga':
    case 'google analytics':
      return `Property '${propertyName}' type changed${typeChange}. This is mapped to '${mappedField}' in Google Analytics and may cause tracking issues.`;

    case 'amplitude':
      return `Property '${propertyName}' type changed${typeChange}. Amplitude expects consistent types for properties. This may affect event segmentation and analysis.`;

    case 'segment':
      return `Property '${propertyName}' type changed${typeChange}. This may affect downstream Segment destinations that expect consistent types.`;

    case 'mixpanel':
      return `Property '${propertyName}' type changed${typeChange}. Mixpanel properties should have consistent types to ensure accurate analytics.`;

    case 'facebook_pixel':
    case 'facebook pixel':
      return `Property '${propertyName}' type changed${typeChange}. This is mapped to '${mappedField}' in Facebook Pixel and may affect conversion tracking.`;

    case 'snowflake':
    case 'bigquery':
    case 'redshift':
    case 'postgres':
    case 'mysql':
      return `Property '${propertyName}' type changed${typeChange}. This may cause schema conflicts in ${destinationType} as column types are typically fixed.`;

    default:
      return `Property '${propertyName}' type changed${typeChange}. This is mapped to '${mappedField}' in ${destinationType} and may cause processing issues.`;
  }
}

/**
 * Get destination-specific removal message
 */
function getDestinationSpecificRemovalMessage(
  destinationType: string,
  propertyName: string,
  mappedField: string
): string {
  switch (destinationType.toLowerCase()) {
    case 'google_analytics':
    case 'ga':
    case 'google analytics':
      return `Property '${propertyName}' removed. The mapped field '${mappedField}' in Google Analytics will no longer receive data.`;

    case 'amplitude':
      return `Property '${propertyName}' removed. This will affect any Amplitude charts or analyses that depend on this property.`;

    case 'mixpanel':
      return `Property '${propertyName}' removed. Existing Mixpanel reports using this property may break.`;

    case 'facebook_pixel':
    case 'facebook pixel':
      return `Property '${propertyName}' removed. The mapped parameter '${mappedField}' in Facebook Pixel will no longer be tracked.`;

    default:
      return `Property '${propertyName}' removed. The mapped field '${mappedField}' in ${destinationType} will no longer receive data.`;
  }
}

/**
 * Create issue from destination impact
 */
function createIssueFromImpact(impact: DestinationImpact, change: PropertyChange): Issue {
  return {
    id: `dest-impact-${impact.destinationName}-${change.propertyName}-${change.file}-${change.line}`,
    severity: impact.severity,
    message: impact.description,
    file: change.file,
    line: change.line,
    impact: `Affects ${impact.destinationName} (${impact.destinationType})`,
    confidence: 'medium',
    source: 'destination',
  };
}

/**
 * Create issue from event change impact
 */
function createIssueFromEventImpact(impact: DestinationImpact, change: EventChange): Issue {
  return {
    id: `dest-impact-event-${impact.destinationName}-${change.eventName}-${change.file}-${change.line}`,
    severity: impact.severity,
    message: impact.description,
    file: change.file,
    line: change.line,
    impact: `Affects ${impact.destinationName} (${impact.destinationType})`,
    confidence: 'medium',
    source: 'destination',
  };
}
