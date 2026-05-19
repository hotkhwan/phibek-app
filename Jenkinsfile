pipeline {
    agent any

    environment {
        REGISTRY_URL          = 'regis.pointit.co.th'
        IMAGE_REPO            = 'phibek/phibek-app'
        DOCKER_CREDENTIALS_ID = 'harbor-credential'
        GIT_CREDENTIALS_ID    = 'git-credentials-id'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    def tag = "${env.BUILD_NUMBER}"
                    dockerImage = docker.build(
                        "${REGISTRY_URL}/${IMAGE_REPO}:${tag}",
                        "--build-arg PUBLIC_APP_BASE_PATH=/ " +
                        "--build-arg PUBLIC_KC_URL=${env.PUBLIC_KC_URL ?: 'https://istio.k-lynx.com/sso'} " +
                        "--build-arg PUBLIC_KC_REALM=${env.PUBLIC_KC_REALM ?: 'klynx'} " +
                        "--build-arg PUBLIC_KC_CLIENT_ID=${env.PUBLIC_KC_CLIENT_ID ?: 'fe'} " +
                        "--build-arg PUBLIC_API_BASE_URL=${env.PUBLIC_API_BASE_URL ?: 'https://istio.k-lynx.com/api/v1'} " +
                        "--build-arg PUBLIC_REALTIME_HUB_ENABLED=${env.PUBLIC_REALTIME_HUB_ENABLED ?: 'true'} " +
                        "--build-arg PUBLIC_MQTT_URL=${env.PUBLIC_MQTT_URL ?: 'wss://istio.k-lynx.com/mqtt'} " +
                        "."
                    )
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    docker.withRegistry("https://${REGISTRY_URL}", "${DOCKER_CREDENTIALS_ID}") {
                        dockerImage.push()
                        dockerImage.push("latest")
                    }
                }
            }
        }

        stage('Update Manifest') {
            steps {
                script {
                    sh "sed -i 's|image: .*${IMAGE_REPO}.*|image: ${REGISTRY_URL}/${IMAGE_REPO}:${env.BUILD_NUMBER}|' k8s/deployment.yaml"

                    withCredentials([usernamePassword(credentialsId: "${GIT_CREDENTIALS_ID}", passwordVariable: 'GIT_PASSWORD', usernameVariable: 'GIT_USERNAME')]) {
                        sh '''
                            git config user.email "jenkins@phibek.local"
                            git config user.name  "Jenkins CI"
                            git add k8s/deployment.yaml
                            git commit -m "chore(cd): update phibek-app image tag ${BUILD_NUMBER} [skip ci]" || echo "nothing to commit"
                            # Uncomment after verifying credentials + remote:
                            # git push https://${GIT_USERNAME}:${GIT_PASSWORD}@<git-host>/<org>/phibek-app.git HEAD:develop
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            sh 'docker image prune -f --filter "dangling=true" || true'
        }
    }
}
