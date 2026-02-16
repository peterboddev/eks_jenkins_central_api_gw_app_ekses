/**
 * TypeScript interface for Jenkins Helm chart values
 * 
 * This interface defines the structure of the Helm values configuration
 * for the official Jenkins Helm chart (https://charts.jenkins.io)
 * 
 * Organized by functional areas:
 * - Identity: ServiceAccount configuration
 * - Resources: CPU, memory, and Java options
 * - Placement: Node selectors and tolerations
 * - Networking: Service and Ingress configuration
 * - Configuration: Plugins and JCasC
 */

/**
 * Toleration configuration for pod scheduling
 */
export interface Toleration {
  key: string;
  operator: string;
  value: string;
  effect: string;
}

/**
 * Resource requests and limits
 */
export interface Resources {
  requests: {
    cpu: string;
    memory: string;
  };
  limits: {
    cpu: string;
    memory: string;
  };
}

/**
 * ServiceAccount configuration
 */
export interface ServiceAccountConfig {
  create: boolean;
  name: string;
}

/**
 * Ingress configuration
 */
export interface IngressConfig {
  enabled: boolean;
  ingressClassName: string;
  annotations: Record<string, string>;
}

/**
 * JCasC (Jenkins Configuration as Code) configuration
 */
export interface JCascConfig {
  defaultConfig: boolean;
  configScripts: Record<string, string>;
}

/**
 * Controller (Jenkins master) configuration
 */
export interface ControllerConfig {
  // Identity
  serviceAccount: ServiceAccountConfig;
  
  // Resources
  resources: Resources;
  javaOpts: string;
  jenkinsOpts: string;
  numExecutors: number;
  
  // Placement
  nodeSelector: Record<string, string>;
  tolerations: Toleration[];
  
  // Networking
  serviceType: string;
  servicePort: number;
  ingress: IngressConfig;
  
  // Configuration
  installPlugins: string[];
  JCasC: JCascConfig;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  enabled: boolean;
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  enabled: boolean;
  storageClass: string;
  size: string;
  accessMode: string;
}

/**
 * RBAC configuration
 */
export interface RbacConfig {
  create: boolean;
  readSecrets: boolean;
}

/**
 * Complete Jenkins Helm values configuration
 */
export interface JenkinsHelmValues {
  controller: ControllerConfig;
  agent: AgentConfig;
  persistence: PersistenceConfig;
  rbac: RbacConfig;
}
