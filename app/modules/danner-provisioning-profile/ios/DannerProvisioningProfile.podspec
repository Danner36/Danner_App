Pod::Spec.new do |s|
  s.name           = 'DannerProvisioningProfile'
  s.version        = '1.0.0'
  s.summary        = 'Reads the expiration date from an embedded iOS provisioning profile.'
  s.description    = 'Local Expo module used by Danner Apps to warn before a free iOS development signature expires.'
  s.license        = { :type => 'MIT' }
  s.author         = 'Danner Apps'
  s.homepage       = 'https://github.com/Danner36/Danner_App'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/Danner36/Danner_App.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
