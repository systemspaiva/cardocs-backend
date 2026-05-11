package app.cardocs.infrastructure.aws

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient
import software.amazon.awssdk.services.dynamodb.DynamoDbClient

@Configuration
class AwsConfiguration(
    @param:Value("\${aws.region}") private val awsRegion: String
) {
    @Bean
    fun dynamoDbClient(): DynamoDbClient =
        DynamoDbClient.builder()
            .region(Region.of(awsRegion))
            .build()

    @Bean
    fun cognitoIdentityProviderClient(): CognitoIdentityProviderClient =
        CognitoIdentityProviderClient.builder()
            .region(Region.of(awsRegion))
            .build()
}
