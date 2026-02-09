// Jenkins Job DSL Seed Job
// This file defines all Jenkins jobs as code
// Place this in a seed job that runs on Jenkins startup

pipelineJob('nginx-api-build') {
    description('Build and deploy nginx-api application to nginx-api-cluster')
    
    properties {
        githubProjectUrl('https://github.com/YOUR_USERNAME/eks_jenkins')
    }
    
    triggers {
        scm('H/5 * * * *')
    }
    
    definition {
        cpsScm {
            scm {
                git {
                    remote {
                        url('https://github.com/YOUR_USERNAME/eks_jenkins.git')
                        credentials('github-credentials')
                    }
                    branches('*/main')
                }
            }
            scriptPath('jenkins-jobs/nginx-api-build/Jenkinsfile')
            lightweight(true)
        }
    }
}

pipelineJob('nginx-docker-build') {
    description('Build nginx demo Docker image')
    
    triggers {
        scm('H/5 * * * *')
    }
    
    definition {
        cpsScm {
            scm {
                git {
                    remote {
                        url('https://github.com/YOUR_USERNAME/eks_jenkins.git')
                        credentials('github-credentials')
                    }
                    branches('*/main')
                }
            }
            scriptPath('jenkins-jobs/nginx-docker-build/Jenkinsfile')
            lightweight(true)
        }
    }
}
