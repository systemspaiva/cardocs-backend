package app.cardocs

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class CardocsBackendApplication

fun main(args: Array<String>) {
    runApplication<CardocsBackendApplication>(*args)
}

