#include <Wire.h>
#include <Preferences.h>
#include <BluetoothSerial.h>

// Hardware and Math constants
#define BUZZER_PIN  25
#define MPU_ADDR    0x68     // I2C address for the MPU6050 sensor
#define G_TO_MS2    9.80665  // Gravity constant to convert to m/s^2
#define RAW_TO_G    16384.0  // Sensitivity factor for the accelerometer

BluetoothSerial SerialBT;
Preferences preferences; // Used to save data to permanent memory 

// Track time spent on each of the 6 sides (in seconds)
unsigned long activitytimer[6] = {0};
// Time limits for each side (default is 2 hours)
unsigned long activitylimit[6] = {7200, 7200, 7200, 7200, 7200, 7200};
unsigned int  compensation[6]  = {0}; // used to comepensate the error due to 3 seconds delay
int  previousside = -1;
int  saveCounter  = 0;   // used to store the data in the permanent periodically for every 12 seconds

// Send a command to wake up the sensor
void wakeMPU() {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x6B); 
    Wire.write(0x00); 
    Wire.endTransmission();
}

// Determines which side of the cube is currently facing up
int getside() {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x3B); // Start reading from the first accelerometer register i.e ax
    if (Wire.endTransmission(false) != 0) return -1; // Sensor not responding

    Wire.requestFrom(MPU_ADDR, 6, true);
    if (Wire.available() < 6) return -1;

    // Read X, Y, and Z axis data and convert to actual gravity units (m/s^2)
    float ax = (int16_t(Wire.read() << 8 | Wire.read()) / RAW_TO_G) * G_TO_MS2;
    float ay = (int16_t(Wire.read() << 8 | Wire.read()) / RAW_TO_G) * G_TO_MS2;
    float az = (int16_t(Wire.read() << 8 | Wire.read()) / RAW_TO_G) * G_TO_MS2;

    // Logic: If one axis shows ~9.8 m/s^2, that side is facing up/down
    if (ax >  8.0) return 0;
    if (ax < -8.0) return 1;
    if (ay >  8.0) return 2;
    if (ay < -8.0) return 3;
    if (az >  8.0) return 4;
    if (az < -8.0) return 5;

    return -1; // The cube is tilted or in-between sides
}

// Listen for Bluetooth commands like "RESET" to clear all tracked time
void handleIncomingCommands() {
    if (!SerialBT.available()) return;

    String input = SerialBT.readStringUntil('\n');
    input.trim();
    String upperInput = input;
    upperInput.toUpperCase();

    // Reset Command 
    if (upperInput == "RESET") {
        preferences.begin("permanent", false);
        preferences.clear(); 
        for (int i = 0; i < 6; i++) activitytimer[i] = 0;
        preferences.end();
        SerialBT.println("SUCCESS: All timers cleared");
        digitalWrite(BUZZER_PIN, HIGH); delay(100); digitalWrite(BUZZER_PIN, LOW);
    } 

    // Set Limit Command (Format: LIMIT:side,seconds) 
    else if (upperInput.startsWith("LIMIT:")) {
        int colonIndex = input.indexOf(':');
        int commaIndex = input.indexOf(',');

        if (commaIndex != -1) {
            // Extract the side and the new limit from the string
            int side = input.substring(colonIndex + 1, commaIndex).toInt() - 1; // -1 because user thinks 1-6, code uses 0-5
            unsigned long newLimit = input.substring(commaIndex + 1).length() > 0 ? input.substring(commaIndex + 1).toInt() : 0;

            if (side >= 0 && side < 6) {
                activitylimit[side] = newLimit;

                // Save this new limit immediately to permanent memory
                preferences.begin("permanent", false);
                preferences.putULong(("l" + String(side)).c_str(), newLimit);
                preferences.end();

                SerialBT.printf("SUCCESS: Side %d limit set to %lu seconds\n", side + 1, newLimit);
            } else {
                SerialBT.println("ERROR: Invalid side (Use 1-6)");
            }
        } else {
            SerialBT.println("ERROR: Use format LIMIT:side,seconds");
        }
    }
}

void setup() {
    Serial.begin(115200);
    SerialBT.begin("Productivity_cube");

    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);

    Wire.begin(21, 22); // Start I2C on standard ESP32 pins
    delay(100);
    wakeMPU();

    // Load previous data from memory so we don't lose progress after a reboot
    preferences.begin("permanent", false);
    for (int i = 0; i < 6; i++) {
        activitytimer[i] = preferences.getULong(("a" + String(i)).c_str(), 0);
        compensation[i]  = preferences.getUInt( ("c" + String(i)).c_str(), 0);
        activitylimit[i] = preferences.getULong(("l" + String(i)).c_str(), 7200);
    }
    preferences.end();

    // Startup beep
    digitalWrite(BUZZER_PIN, HIGH); delay(200); digitalWrite(BUZZER_PIN, LOW);
}

void loop() {
    handleIncomingCommands();

    int currentside = getside();

    if (currentside != -1) {
        // Since we delay 3 seconds at the end, we add 3s to the timer
        activitytimer[currentside] += 3;

        // sending data to dashboard via bluetooth serial
        String data = "Side " + String(currentside + 1) + " | Total Time: " + String(activitytimer[currentside]) + "s\n";
        Serial.print(data);
        SerialBT.print(data);

        // Alert the user if they've exceeded their time limit for this activity
        if (activitytimer[currentside] > activitylimit[currentside]) {
            digitalWrite(BUZZER_PIN, HIGH); 
        } else {
            digitalWrite(BUZZER_PIN, LOW);
        }

        // compensating the error
        if (currentside != previousside) {
            compensation[currentside]++;
            if (previousside != -1 && compensation[previousside] > 0)
                compensation[previousside]--;
            previousside = currentside;
        }

        // saving data to premanent memory every 12 seconds to prevent wearing out the flash storage
        saveCounter += 3;
        if (saveCounter >= 12) {
            preferences.begin("permanent", false);
            preferences.putULong(("a" + String(currentside)).c_str(), activitytimer[currentside]);
            preferences.putUInt( ("c" + String(currentside)).c_str(), compensation[currentside]);
            preferences.end();
            saveCounter = 0;
        }

    } else {
        // If the sensor fails or cube is vibrating, turn off buzzer and try to wake it up
        digitalWrite(BUZZER_PIN, LOW);
        wakeMPU();
    }

    delay(3000); // Wait 3 seconds before the next check
}
