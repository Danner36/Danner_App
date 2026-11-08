Pod::Spec.new do |s|
  s.name           = 'DannerWebViewCookies'
  s.version        = '1.0.0'
  s.summary        = 'Clears the YouTube TV session and reports whether one is present.'
  s.description    = 'Local Expo module used by Danner Apps to manage the embedded YouTube TV sign-in.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Danner Apps'
  s.homepage       = 'https://github.com/Danner36/Danner_App'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/Danner36/Danner_App.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WebKit'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_STRICT_CONCURRENCY' => 'minimal'
  }
end
