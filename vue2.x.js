/*
* vue双向绑定
* 1.模板编译 compile: {{}} v-
* 2.数据劫持 observer:getter setter
* 3.监听变化 watcher
* */
class Vue {
    constructor({el, data, computed, methods}) {
        //将可能需要用的属性挂载到实例上
        this.$el = el;
        this.$watcher = new Watcher();
        this.$data = data;
        this.computed = computed;
        this.methods = methods;
        this.$init();
    }

    $init() {
        //如果有数据，则劫持数据
        if (this.$data) {
            new Observer(this);
        }
        //将computed中的方法挂到this上
        if (this.computed) {
            this._initComputed();
        }
        //将methods中的方法挂到this上
        if (this.methods) {
            this._initMethods();
        }
        //如果有模板，则编译
        if (this.$el) {
            //将数据编译到模板显示对应值
            new Compiler(this);
        }
    }

    //computed只是把数据挂到this上 其属性改变自身不会触发更新，它依赖计算数据触发更新。因此 computed可以缓存
    _initComputed() {
        let that = this;
        //获取computed对象里的所有属性
        let computed = Reflect.ownKeys(this.computed);
        //将computed对象里的所有属性挂载到this上
        computed.forEach((key) => {
            let val = this.computed[key];
            Object.defineProperty(that, key, {
                //当属性值是方法时直接返回该值否则就是对象则返回对象的get方法
                get: typeof val == 'function' ? val : val.get,
                set() {
                }
            })
        })
    }

    _initMethods() {
        let that = this;
        //获取computed对象里的所有属性
        let method = Reflect.ownKeys(this.methods);
        //将computed对象里的所有属性挂载到this上
        method.forEach((key) => {
            let val = this.methods[key];
            Object.defineProperty(that, key, {
                //当属性值是方法时直接返回该值否则就是对象则返回对象的get方法
                get: typeof val == 'function' ? val : val.get,
                set() {
                }
            })
        })
    }
}

//1.模板编译  {{}} v-
class Compiler {
    constructor(vm) {
        this.el = this.isElementNode(vm.$el) ? el : document.querySelector(vm.$el);
        this.vm = vm;
        this.$init();
    }

    $init() {
        //若果有元素 则编译
        if (this.el) {
            // 1.把dom节点移入内存中(创建fragment)
            let fragment = this.createFragment(this.el);
            // 2.编译 提取 v-  {{}} ...
            this.compile(fragment);
            // 3.将编译好的fragment挂载到页面上
            this.el.appendChild(fragment);
        }
    }

    /*核心方法=========================*/

    createFragment(el) {
        //1.创建一个文档片段
        let fragment = document.createDocumentFragment(el);
        //2.将el中的DOM节点一个一个移入到创建的文档片段里（内存中）
        while (el.firstChild) {
            fragment.appendChild(el.firstChild);
        }
        return fragment;
    }

    compile(fragment) {
        //获取fragment的儿子节点
        Array.from(fragment.childNodes).forEach(node => {
            //元素节点
            if (this.isElementNode(node)) {
                //孙子节点需要递归
                if (node.childNodes) {
                    this.compile(node);
                }
                //编译 v-
                this.compileElement(node)
            }
            //文本节点
            else {
                //编译 {{}}
                this.compileText(node)
            }
        })
    }

    compileElement(node) {
        //遍历节点的所有属性
        Array.from(node.attributes).forEach(attr => {
            //属性名字是一个指令( v- ) eg.: v-model="b.a"
            if (this.ifDirective(attr.name)) {
                //添加订阅者
                this.vm.$watcher.attach(() => {
                    node.value = this.getVal(attr.value);
                });
                //替换对应值
                node.value = this.getVal(attr.value);
                //为v-model元素绑定事件实现双向绑定
                if (attr.name.indexOf('v-model') >= 0) {
                    node.addEventListener('input', (e) => {
                        this.vm[attr.value] = e.target.value;
                    })
                }
            }
            //属性名字是一个事件( @ ) eg.:  @click="handleClick(param)"
            if (this.isEvent(attr.name)) {
                //事件名 eg.:  click
                let eventName = attr.name.split('@')[1];
                //匹配（）中的内容
                let reg = /\((.*)\)/;
                //事件函数名  eg.:  handleClick
                let methodName = attr.value.split('(')[0];
                reg.test(attr.value);
                //参数名 eg.:  param
                let param = RegExp.$1.split(')')[0];
                let event = this.vm.methods[methodName];
                //给元素节点添加事件
                node.addEventListener(eventName, event.bind(this.vm, param))
            }
        })
    }

    compileText(node) {
        //取文本中的内容 eg.: {{a}} {{b.a}} {{c}}
        let text = node.textContent;
        //匹配{{}}中的内容
        let reg = /\{\{([^}]+)\}\}/g;
        let exp = reg.exec(text);
        if (exp) {
            //添加订阅者
            this.vm.$watcher.attach(() => {
                node.textContent = text.replace(reg, (...arg) => {
                    return this.getVal(arg[1]);
                });
            });
            //替换{{}}对应值
            node.textContent = text.replace(reg, (...arg) => {
                return this.getVal(arg[1]);
            });
        }
    }

    /*一些辅助方法=====================*/

    //是元素节点
    isElementNode(node) {
        return node.nodeType === 1;
    }

    isEvent(attr) {
        return attr.indexOf('@') === 0
    }

    //是指令
    ifDirective(attr) {
        return attr.includes('v-');
    }

    //从this.data对象中获取对应的属性值
    getVal(attrs) {
        let textArr = attrs.split('.');
        return textArr.reduce((prev, next) => {
            return prev[next]
        }, this.vm);
    }

}


//2.数据劫持 getter setter
class Observer {
    constructor(vm) {
        this.vm = vm;
        this.$init();
    }

    $init() {
        let vm = this.vm;
        //使用this代理this.data,当访问this.xxx时则去访问this.data.xxx
        for (let key in vm.$data) {
            Object.defineProperty(vm, key, {
                enumerable: true,
                get() {
                    return vm.$data[key]
                },
                set(newVal) {
                    vm.$data[key] = newVal;
                }
            })
        }
        //给this.data中的属性添加数据劫持
        this.observe(vm.$data)
    }

    observe(data) {
        //遍历出data对象上的所有属性 eg.: data:{a:1,b:{c:2}}
        if (data && typeof data == 'object') {
            for (let key in data) {
                let val = data[key];
                //每个属性添加数据劫持 eg.: data.a,data.b
                this.defineReactive(data, key, val);
                //属性值 递归添加数据劫持 eg.: data.b.a
                this.observe(val);
            }
        }
    }

    defineReactive(target, key, val) {
        let that = this;
        let vm = this.vm;
        Object.defineProperty(target, key, {
            enumerable: true,
            configurable: true,
            get() {
                return val;
            },
            set(newVal) {
                if (val != newVal) {
                    val = newVal;
                    //触发事件监听的更新函数
                    vm.$watcher.notify();
                    //c.如果新的值是一个对象 则需要给这个对象也增加数据劫持
                    that.observe(val);
                }
            }
        })
    }
}

//3.监听变化:给数据增加观察者，当数据改变时执行对应的方法
class Watcher {
    constructor() {
        //订阅者集合
        this.subs = [];
    }

    //注册
    attach(fn) {
        this.subs.push({update: fn});
    }

    //通知更新
    notify() {
        this.subs.forEach(sub => sub.update());
    }

}
