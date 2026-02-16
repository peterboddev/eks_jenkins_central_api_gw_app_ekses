/**
 * Jenkins Helm Chart Configuration Builder
 * 
 * This module provides functions to build the Helm values configuration
 * for the official Jenkins Helm chart deployment via CDK.
 * 
 * Following the deployment philosophy: everything is configured in TypeScript,
 * no manual steps or placeholder replacements required.
 */

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { JenkinsHelmValues } from './jenkins-helm-values';

export interface JenkinsHelmConfigProps {
  /**
   * Security group ID for the ALB
   */
  albSecurityGroupId: string;
  
  /**
   * AWS region for the deployment
   */
  region: string;
}

/**
 * Build the complete Helm values configuration for Jenkins
 * 
 * This function creates the Helm values object that will be passed to
 * cluster.addHelmChart(). All configuration is done programmatically
 * following the deployment philosophy.
 * 
 * @param props Configuration properties
 * @returns Complete Helm values object
 */
export function buildJenkinsHelmValues(props: JenkinsHelmConfigProps): JenkinsHelmValues {
  return {
    controller: {
      // ===== IDENTITY =====
      // ServiceAccount configuration
      // The ServiceAccount is created separately via CDK's addServiceAccount()
      // for IRSA integration. Helm chart just references it.
      serviceAccount: {
        create: false,  // Don't create - use CDK-created SA
        name: 'jenkins-controller',
      },
      
      // ===== RESOURCES =====
      // Controller resource configuration
      resources: {
        requests: {
          cpu: '2000m',
          memory: '8Gi',
        },
        limits: {
          cpu: '4',
          memory: '12Gi',
        },
      },
      
      // Java and Jenkins options
      javaOpts: '-Xmx8g -Xms4g',
      jenkinsOpts: '--sessionTimeout=1440',
      numExecutors: 0,  // Force all builds to agents
      
      // ===== PLACEMENT =====
      // Node placement configuration
      nodeSelector: {
        'workload-type': 'jenkins-controller',
      },
      
      tolerations: [
        {
          key: 'workload-type',
          operator: 'Equal',
          value: 'jenkins-controller',
          effect: 'NoSchedule',
        },
      ],
      
      // ===== NETWORKING =====
      // Service configuration
      serviceType: 'ClusterIP',
      servicePort: 8080,
      
      // Ingress configuration with ALB
      ingress: {
        enabled: true,
        ingressClassName: 'alb',
        annotations: {
          'alb.ingress.kubernetes.io/scheme': 'internet-facing',
          'alb.ingress.kubernetes.io/target-type': 'ip',
          'alb.ingress.kubernetes.io/healthcheck-path': '/login',
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP": 80}]',
          'alb.ingress.kubernetes.io/security-groups': props.albSecurityGroupId,
          'alb.ingress.kubernetes.io/load-balancer-name': 'jenkins-alb',
        },
      },
      
      // ===== CONFIGURATION =====
      // Plugin installation
      installPlugins: [
        'kubernetes:4360.v0e4b_1c40e9e5',
        'workflow-aggregator:600.vb_57cdd26fdd7',
        'git:5.7.0',
        'configuration-as-code:1909.vb_b_f59a_b_b_5d61',
        'job-dsl:1.92',
        'docker-workflow:580.vc0c340686b_54',
        'github:1.40.0',
        'github-branch-source:1797.v86fdb_4d57d43',
        'aws-credentials:242.va_acc7c9489f0',
        'credentials-binding:681.vf91669a_32e45',
        'timestamper:1.27',
        'ws-cleanup:0.46',
        'ansicolor:1.0.4',
      ],
      
      // JCasC configuration
      JCasC: {
        defaultConfig: true,
        configScripts: {
          // Welcome message
          'welcome-message': `
jenkins:
  systemMessage: "Jenkins on EKS - Configured via Helm + JCasC"
`,
          
          // Kubernetes cloud configuration
          'kubernetes-cloud': `
jenkins:
  clouds:
    - kubernetes:
        name: "kubernetes"
        serverUrl: "https://kubernetes.default"
        namespace: "jenkins"
        jenkinsUrl: "http://jenkins:8080"
        jenkinsTunnel: "jenkins:50000"
        connectTimeout: 5
        readTimeout: 15
        containerCapStr: "10"
        maxRequestsPerHostStr: "32"
        retentionTimeout: 5
        templates:
          - name: "jenkins-agent-dind"
            namespace: "jenkins"
            label: "jenkins-agent"
            nodeUsageMode: NORMAL
            idleMinutes: 10
            serviceAccount: "jenkins-controller"
            yamlMergeStrategy: "override"
            yaml: |
              apiVersion: v1
              kind: Pod
              metadata:
                labels:
                  jenkins: agent
              spec:
                affinity:
                  nodeAffinity:
                    preferredDuringSchedulingIgnoredDuringExecution:
                    - weight: 100
                      preference:
                        matchExpressions:
                        - key: node-lifecycle
                          operator: In
                          values:
                          - spot
                  podAntiAffinity:
                    requiredDuringSchedulingIgnoredDuringExecution:
                    - labelSelector:
                        matchExpressions:
                        - key: app
                          operator: In
                          values:
                          - jenkins-controller
                      topologyKey: kubernetes.io/hostname
                containers:
                - name: jnlp
                  image: jenkins/inbound-agent:latest
                  imagePullPolicy: IfNotPresent
                  resources:
                    requests:
                      cpu: "500m"
                      memory: "1Gi"
                    limits:
                      cpu: "1"
                      memory: "2Gi"
                  env:
                  - name: JENKINS_URL
                    value: "http://jenkins:8080"
                  - name: JENKINS_TUNNEL
                    value: "jenkins:50000"
                  - name: DOCKER_HOST
                    value: "tcp://localhost:2375"
                  volumeMounts:
                  - name: workspace-volume
                    mountPath: /home/jenkins/agent
                - name: docker
                  image: docker:24-dind
                  imagePullPolicy: IfNotPresent
                  securityContext:
                    privileged: true
                  resources:
                    requests:
                      cpu: "500m"
                      memory: "1Gi"
                    limits:
                      cpu: "2"
                      memory: "4Gi"
                  env:
                  - name: DOCKER_TLS_CERTDIR
                    value: ""
                  volumeMounts:
                  - name: docker-storage
                    mountPath: /var/lib/docker
                volumes:
                - name: workspace-volume
                  emptyDir: {}
                - name: docker-storage
                  emptyDir: {}
                restartPolicy: Never
`,
          
          // Seed job configuration
          'jobs': `
jobs:
  - script: >
      pipelineJob('seed-job') {
        description('Seed job that creates all other Jenkins jobs from Job DSL scripts in Git')
        definition {
          cps {
            script('''
              node('jenkins-agent') {
                stage('Checkout') {
                  git url: 'https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git',
                      branch: 'main'
                }
                stage('Execute Job DSL') {
                  jobDsl targets: 'jenkins-jobs/seed_job.groovy',
                         sandbox: false,
                         removedJobAction: 'DELETE',
                         removedViewAction: 'DELETE'
                }
              }
            ''')
            sandbox(false)
          }
        }
        triggers {
          scm('H/5 * * * *')
        }
      }
`,
          
          // Security configuration
          'security': `
security:
  globalJobDslSecurityConfiguration:
    useScriptSecurity: false

jenkins:
  securityRealm:
    local:
      allowsSignup: false
  authorizationStrategy:
    loggedInUsersCanDoAnything:
      allowAnonymousRead: false
`,
          
          // Tool configuration
          'tools': `
tool:
  git:
    installations:
      - name: "Default"
        home: "git"
`,
        },
      },
    },
    
    // Agent configuration - disabled (use dynamic Kubernetes agents)
    agent: {
      enabled: false,
    },
    
    // Persistence configuration - use existing EFS storage
    persistence: {
      enabled: true,
      storageClass: 'jenkins-efs',
      size: '100Gi',
      accessMode: 'ReadWriteMany',
    },
    
    // RBAC configuration
    rbac: {
      create: true,
      readSecrets: true,
    },
  };
}
