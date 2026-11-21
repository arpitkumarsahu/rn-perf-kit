require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RnPerfKit"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/rn-perf-kit/rn-perf-kit"
  s.license      = "MIT"
  s.authors      = { "rn-perf-kit team" => "contact@rn-perf-kit.dev" }
  s.platforms    = { :ios => "13.4" }
  s.source       = { :git => "https://github.com/rn-perf-kit/rn-perf-kit.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  # React Native New Architecture dependencies
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
