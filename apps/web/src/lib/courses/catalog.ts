import "server-only";

// Snapshot generated from the local Projects manuals so the course pages stay deployable on Vercel.
export type CourseMode = "block" | "text";
export type CourseEnvironment = "virtual" | "physical";

export interface CourseLesson {
  id: string;
  slug: string;
  title: string;
  summary: string;
  board: string;
  mode: CourseMode;
  language: string;
  generator: string;
  environment: CourseEnvironment;
  difficulty: string;
  sourceLabel: string;
}

export interface CourseTrack {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  lessonCount: number;
  lessons: CourseLesson[];
}

const COURSE_CATALOG: CourseTrack[] = [
  {
    "slug": "coder",
    "title": "CODER",
    "subtitle": "Circuit foundations",
    "description": "Starter lessons for LEDs, buttons, ultrasonic sensing, servo motion, and breadboard confidence.",
    "lessonCount": 9,
    "lessons": [
      {
        "id": "coder-1",
        "slug": "light-emitting-diode-led",
        "title": "Light Emitting Diode (LED)",
        "summary": "Practice light emitting diode (led) concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-2",
        "slug": "buzzer",
        "title": "Buzzer",
        "summary": "Practice buzzer concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-3",
        "slug": "push-button",
        "title": "Push Button",
        "summary": "Practice push button concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-4",
        "slug": "traffic-light-module",
        "title": "Traffic Light Module",
        "summary": "Practice traffic light module concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-5",
        "slug": "red-green-blue-rgb-module",
        "title": "Red Green Blue (RGB) Module",
        "summary": "Practice red green blue (rgb) module concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-6",
        "slug": "light-dependent-resistor-ldr",
        "title": "Light Dependent Resistor (LDR)",
        "summary": "Practice light dependent resistor (ldr) concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-7",
        "slug": "servo-motor",
        "title": "Servo Motor",
        "summary": "Practice servo motor concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-8",
        "slug": "ultrasonic-sensor",
        "title": "Ultrasonic Sensor",
        "summary": "Practice ultrasonic sensor concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      },
      {
        "id": "coder-9",
        "slug": "sound-sensor",
        "title": "Sound Sensor",
        "summary": "Practice sound sensor concepts with beginner-friendly circuit builds, guided wiring, and quick feedback loops.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "virtual",
        "difficulty": "Starter",
        "sourceLabel": "CODER Manual"
      }
    ]
  },
  {
    "slug": "aider",
    "title": "AIDER",
    "subtitle": "Connected hardware projects",
    "description": "Structured project-based learning for Wi-Fi, IoT dashboards, cloud logging, and embedded automation.",
    "lessonCount": 31,
    "lessons": [
      {
        "id": "aider-1",
        "slug": "wi-fi-led-control-via-web-page",
        "title": "Wi-Fi LED Control via Web Page",
        "summary": "In this project, you will build a **Wi-Fi-controlled LED** that can be turned ON and OFF from any web browser on your network. This is the foundation of smart home technology - controlling devices remotely over the internet!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-2",
        "slug": "wi-fi-buzzer-control",
        "title": "Wi-Fi Buzzer Control",
        "summary": "In this project, you will build a **Wi-Fi-controlled buzzer** that can be activated from any web browser on your network. This is perfect for remote alerts, doorbells, or notification systems!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-3",
        "slug": "wi-fi-relay-switch",
        "title": "Wi-Fi Relay Switch",
        "summary": "In this project, you will build a **Wi-Fi-controlled relay** that can switch external devices ON and OFF from a web browser. The relay acts as an electronic switch, allowing your Pico to control devices that need more power than GPIO pins can provide!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-4",
        "slug": "online-temperature-monitor",
        "title": "Online Temperature Monitor",
        "summary": "In this project, you will build a **real-time temperature monitor** accessible from any web browser on your network. The page automatically refreshes to show the latest temperature readings!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-5",
        "slug": "online-humidity-monitor",
        "title": "Online Humidity Monitor",
        "summary": "Build on Project 34 to add humidity monitoring with **status feedback** (Dry/Comfortable/Humid). This helps users understand the data at a glance!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-6",
        "slug": "light-intensity-cloud-logger",
        "title": "Light Intensity Cloud Logger",
        "summary": "Build a **light intensity data logger** that stores the last 10 readings and displays them on a web page. See how light levels change over time!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-7",
        "slug": "pir-motion-alert-via-wi-fi",
        "title": "PIR Motion Alert via Wi-Fi",
        "summary": "Build a **motion detection alert system** that notifies you via web page when movement is detected. Perfect for security systems or occupancy monitoring!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-8",
        "slug": "water-level-webpage",
        "title": "Water Level Webpage",
        "summary": "Build a **water level monitoring system** with a visual bar graph! Perfect for monitoring tanks, reservoirs, or any container.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-9",
        "slug": "soil-moisture-cloud-display",
        "title": "Soil Moisture Cloud Display",
        "summary": "Build a **soil moisture monitoring system** for plants! Know exactly when to water your plants with this IoT sensor.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-10",
        "slug": "rain-status-webpage",
        "title": "Rain Status Webpage",
        "summary": "Build a **rain detection system** that alerts you when it's raining! Perfect for weather monitoring or smart irrigation systems.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-11",
        "slug": "wi-fi-doorbell",
        "title": "Wi-Fi Doorbell",
        "summary": "Build a **smart doorbell** that rings a buzzer when triggered from a web button! Perfect for smart home projects.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-12",
        "slug": "iot-dashboard-oled",
        "title": "IoT Dashboard OLED",
        "summary": "Create a **local IoT dashboard** with OLED display showing Wi-Fi status, IP address, and sensor readings!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-13",
        "slug": "online-motor-control",
        "title": "Online Motor Control",
        "summary": "Control a **DC motor** remotely via web browser! Learn about relay safety and flyback diodes for inductive loads.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-14",
        "slug": "wi-fi-button-logger",
        "title": "Wi-Fi Button Logger",
        "summary": "Build a **button press logger** with timestamps! Records every button press with the time it occurred.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-15",
        "slug": "web-led-brightness",
        "title": "Web LED Brightness",
        "summary": "Control LED brightness with a **web slider**! Learn how PWM creates smooth dimming effects.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-16",
        "slug": "cloud-timer-switch",
        "title": "Cloud Timer Switch",
        "summary": "Create a **web-configurable timer** that turns a device on for a set time, then automatically turns it off!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-17",
        "slug": "wi-fi-heart-rate-monitor",
        "title": "Wi-Fi Heart Rate Monitor",
        "summary": "Build a **heart rate monitor** accessible via web browser! Uses the MAX30102 pulse sensor.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-18",
        "slug": "remote-irrigation-control",
        "title": "Remote Irrigation Control",
        "summary": "Control a **water pump** remotely for automated irrigation! Turn watering on/off from your phone.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-19",
        "slug": "environmental-data-logger",
        "title": "Environmental Data Logger",
        "summary": "Log **temperature and humidity** data over time with a rolling history display!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-20",
        "slug": "smart-room-light-monitor",
        "title": "Smart Room Light Monitor",
        "summary": "Build an **automatic light control system** that turns lights on when it's dark! Combines light sensing with relay control.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-21",
        "slug": "wi-fi-relay-scheduler",
        "title": "Wi-Fi Relay Scheduler",
        "summary": "Schedule your relay to **turn on/off at specific times**! Combined with OLED display for local status.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-22",
        "slug": "iot-alarm-clock",
        "title": "IoT Alarm Clock",
        "summary": "Build a **smart alarm clock** with OLED display and buzzer! Set alarms via web browser.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-23",
        "slug": "web-motion-counter",
        "title": "Web Motion Counter",
        "summary": "Count **motion events** and display on web page and OLED! Perfect for occupancy tracking.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-24",
        "slug": "soil-dryness-indicator",
        "title": "Soil Dryness Indicator",
        "summary": "Monitor **soil moisture** with visual alerts when too dry! Includes OLED display and buzzer.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-25",
        "slug": "wi-fi-color-sensor",
        "title": "Wi-Fi Color Sensor",
        "summary": "Control **RGB LED colors** via web interface! Select colors from your browser.",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-26",
        "slug": "wi-fi-touch-switch",
        "title": "Wi-Fi Touch Switch",
        "summary": "Control devices via **touch sensor** with web status display!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-27",
        "slug": "web-water-pump",
        "title": "Web Water Pump",
        "summary": "Control a **water pump** with web buttons and auto-shutoff when tank is full!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-28",
        "slug": "rain-alert-system",
        "title": "Rain Alert System",
        "summary": "Build a **rain detection alert system** that sounds an alarm when rain is detected!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-29",
        "slug": "safety-alert-buzzer",
        "title": "Safety Alert Buzzer",
        "summary": "Create a **web-controlled safety buzzer** for emergency alerts!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-30",
        "slug": "iot-plant-status",
        "title": "IoT Plant Status",
        "summary": "Build a comprehensive **plant monitoring system** with multiple sensors!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      },
      {
        "id": "aider-31",
        "slug": "wi-fi-temperature-alert",
        "title": "Wi-Fi Temperature Alert",
        "summary": "Monitor temperature with **web alerts** when it gets too hot or cold!",
        "board": "Raspberry Pi Pico 2W",
        "mode": "text",
        "language": "python",
        "generator": "micropython",
        "environment": "physical",
        "difficulty": "Guided Build",
        "sourceLabel": "AIDER Student Manual"
      }
    ]
  },
  {
    "slug": "rova",
    "title": "ROVA",
    "subtitle": "Robotics journey",
    "description": "Hands-on rover programming lessons that connect movement, sensors, and guided robotics workflows.",
    "lessonCount": 1,
    "lessons": [
      {
        "id": "rova-1",
        "slug": "program-the-rover",
        "title": "Program the Rover",
        "summary": "Learn rover control basics through a guided robotics manual, then carry the logic into your own block-based or text-based builds.",
        "board": "Arduino Uno",
        "mode": "block",
        "language": "cpp",
        "generator": "arduino",
        "environment": "physical",
        "difficulty": "Robotics",
        "sourceLabel": "ROVA Manual"
      }
    ]
  }
];

export function getCourseCatalog(): CourseTrack[] {
  return COURSE_CATALOG;
}

export function getCourseTrack(trackSlug: string): CourseTrack | null {
  return COURSE_CATALOG.find((track) => track.slug === trackSlug) || null;
}
